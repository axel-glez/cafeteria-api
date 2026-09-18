import { Router } from 'express';
import { z } from 'zod';
import { accessDb } from '../lib/access';
import { ApiError } from '../lib/catalog';
import { readCafeStatus } from '../lib/cafe-status';
import { requireAdmin } from './auth';

export const cafeStatusRouter = Router();
cafeStatusRouter.get('/', async (_req, res) => { res.json(await readCafeStatus()); });
cafeStatusRouter.patch('/', requireAdmin, async (req, res) => {
  const data = z.strictObject({ is_open: z.boolean(), expected_updated_at: z.iso.datetime() }).parse(req.body);
  const result = await accessDb.query(
    `UPDATE public.cafe_settings SET is_open=$1, updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',updated_at)+interval '1 millisecond')
     WHERE id=1 AND date_trunc('milliseconds',updated_at)=$2::timestamptz RETURNING is_open,updated_at`,
    [data.is_open, data.expected_updated_at],
  );
  if (!result.rows[0]) throw new ApiError(409, 'El estado de la cafetería cambió. Actualiza y vuelve a intentar.', 'CAFE_STATE_CHANGED');
  res.json(result.rows[0]);
});
