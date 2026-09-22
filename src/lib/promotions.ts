import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { accessDb } from './access';
import { ApiError } from './catalog';

export const promotionImageOrigins: string[] = JSON.parse(readFileSync(new URL('../../public/assets/image-origins.json', import.meta.url), 'utf8'));
const origins = new Set(promotionImageOrigins);
function validImage(value: string) {
  if (!value || /^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && origins.has(url.origin);
  } catch { return false; }
}
const text = z.string().trim().min(1, 'Completa los textos del anuncio').refine(v => !v.includes('\u0000'), 'Texto no válido');
export const promotionSchema = z.strictObject({
  id: z.uuid(),
  label: text.max(25),
  title: text.max(70),
  description: text.max(180),
  image: z.string().trim().max(1000).refine(validImage, 'Usa una imagen local assets/archivo.jpg, una URL HTTPS de un dominio autorizado o deja la imagen vacía'),
  active: z.boolean(),
});
export const promotionsSchema = z.array(promotionSchema).max(12).refine(items => new Set(items.map(p => p.id)).size === items.length, 'No repitas identificadores');
export async function appendPromotions(input: unknown) {
  const additions = promotionsSchema.parse(input);
  const client = await accessDb.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    const result = await client.query('SELECT items FROM public.promotion_settings WHERE id=1 FOR UPDATE');
    if (!result.rows[0]) throw new ApiError(503, 'Ejecuta primero promotions:migrate');
    const current = promotionsSchema.parse(result.rows[0].items);
    const missing = additions.filter(p => !current.some(existing => existing.id === p.id));
    const items = promotionsSchema.parse([...current, ...missing]);
    if (missing.length) await client.query('UPDATE public.promotion_settings SET items=$1::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE id=1', [JSON.stringify(items)]);
    await client.query('COMMIT');
    return missing.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function readPromotions(): Promise<{ items: z.infer<typeof promotionsSchema>; revision: number; updated_at: Date }> {
  try {
    const result = await accessDb.query('SELECT items,revision,updated_at FROM public.promotion_settings WHERE id=1');
    if (!result.rows[0]) throw new ApiError(503, 'Falta preparar las promociones en la base de datos', 'PROMOTIONS_UNAVAILABLE');
    return { ...result.rows[0], items: promotionsSchema.parse(result.rows[0].items) };
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') throw new ApiError(503, 'Falta aplicar la migración de promociones', 'PROMOTIONS_UNAVAILABLE');
    throw error;
  }
}
