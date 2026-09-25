import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { accessDb } from '../lib/access.js';
import { ApiError } from '../lib/catalog.js';
import { mediaPath } from '../lib/media.js';

export const mediaRouter = Router();
export const publicMediaRouter = Router();
const signatures: Record<string, (data: Buffer) => boolean> = {
  'image/jpeg': data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/png': data => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  'image/webp': data => data.length >= 12 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP',
};

publicMediaRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const result = await accessDb.query('SELECT mime_type,data FROM public.media_files WHERE id=$1', [id]);
  if (!result.rows[0]) { res.status(404).json({ error: 'Imagen no encontrada' }); return; }
  const data = Buffer.from(result.rows[0].data);
  res.set({ 'Content-Type': result.rows[0].mime_type, 'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': 'inline' });
  res.send(data);
});

mediaRouter.post('/', async (req, res) => {
  const mime = req.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!signatures[mime] || !signatures[mime](data)) throw new ApiError(400, 'El archivo debe ser una imagen JPG, PNG o WebP válida');
  const id = randomUUID();
  const client = await accessDb.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query(`DELETE FROM public.media_files f WHERE f.created_at < now()-interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.products p WHERE NOT p.archived AND p.image=$1||f.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.promotion_settings s, jsonb_array_elements(s.items) p WHERE p->>'image'=$1||f.id::text)`, ['/api/v1/archivos/']);
    const usage = await client.query('SELECT coalesce(sum(byte_size),0)::bigint AS bytes FROM public.media_files');
    if (Number(usage.rows[0].bytes) + data.length > 50 * 1024 * 1024) throw new ApiError(413, 'Se alcanzó el espacio disponible para imágenes');
    await client.query('INSERT INTO public.media_files(id,mime_type,byte_size,data) VALUES($1,$2,$3,$4)', [id, mime, data.length, data]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  res.status(201).json({ image: mediaPath(id) });
});
