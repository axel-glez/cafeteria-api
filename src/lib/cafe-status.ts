import type { Pool, PoolClient } from 'pg';
import { accessDb } from './access.js';
import { ApiError } from './catalog.js';

export const cafeClosedMessage = 'La cafetería está cerrada y no está recibiendo pedidos. Puedes seguir consultando el menú y preparando tu carrito.';

export async function readCafeStatus(db: Pool | PoolClient = accessDb, lock = false) {
  const result = await db.query<{ is_open: boolean; updated_at: Date }>(
    'SELECT is_open, updated_at FROM public.cafe_settings WHERE id=1' + (lock ? ' FOR SHARE' : ''),
  );
  if (!result.rows[0]) throw new ApiError(503, 'No se pudo consultar el estado de la cafetería. Intenta de nuevo.');
  return result.rows[0];
}

export async function requireCafeOpen(db: PoolClient) {
  // El bloqueo se conserva hasta COMMIT: cerrar espera los pedidos ya aceptados.
  if (!(await readCafeStatus(db, true)).is_open) {
    throw new ApiError(409, cafeClosedMessage, 'CAFE_CLOSED');
  }
}
