import { Router } from 'express';
import { z } from 'zod';
import { accessDb } from '../lib/access';
import { ApiError } from '../lib/catalog';
import { promotionsSchema, promotionImageOrigins, readPromotions } from '../lib/promotions';

export const promotionsRouter = Router();
export const publicPromotionsRouter = Router();
publicPromotionsRouter.get('/', async (_req, res) => {
  const data = await readPromotions();
  res.json({ items: data.items.filter(p => p.active) });
});
promotionsRouter.get('/', async (_req, res) => {
  res.json({ ...await readPromotions(), image_origins: promotionImageOrigins });
});
promotionsRouter.put('/', async (req, res) => {
  const data = z.strictObject({ items: promotionsSchema, expected_revision: z.number().int().min(0) }).parse(req.body);
  // Un solo UPDATE es atómico: un panel antiguo nunca sobrescribe otro cambio.
  await readPromotions();
  const result = await accessDb.query(
    `UPDATE public.promotion_settings SET items=$1::jsonb,revision=revision+1,updated_at=clock_timestamp()
     WHERE id=1 AND revision=$2 RETURNING items,revision,updated_at`,
    [JSON.stringify(data.items), data.expected_revision],
  );
  if (!result.rows[0]) throw new ApiError(409, 'Otro administrador cambió los anuncios. Recarga las promociones antes de volver a publicar.', 'PROMOTIONS_CHANGED');
  res.json({ ...result.rows[0], image_origins: promotionImageOrigins });
});
