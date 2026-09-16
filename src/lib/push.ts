import { accessDb } from './access';
import { orderPushMessage } from './push-message';

// A durable outbox is written in the same transaction as each status change.
// A lease prevents multiple server instances from sending the same job concurrently.
async function expo(path: string, body: unknown) {
  const response = await fetch('https://exp.host/--/api/v2/push/' + path, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.EXPO_ACCESS_TOKEN } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('ExpoHTTP' + response.status);
  return await response.json() as { data?: any; errors?: unknown[] };
}
let running = false;
export async function drainPushJobs() {
  if (running) return;
  running = true;
  try {
    for (let n = 0; n < 20; n++) {
      const claimed = await accessDb.query(`UPDATE public.order_push_jobs SET next_attempt_at=now()+interval '2 minutes',attempts=attempts+1
        WHERE id=(SELECT id FROM public.order_push_jobs WHERE finished_at IS NULL AND next_attempt_at<=now()
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
      const job = claimed.rows[0];
      if (!job) break;
      try {
        const active = await accessDb.query(`SELECT 1 FROM public.order_push_devices d JOIN public.order_sessions s ON s.token_hash=d.session_hash
          WHERE d.token=$1 AND d.session_hash=$2 AND s.expires_at>now()`, [job.token, job.session_hash]);
        if (!active.rowCount || Date.now() - new Date(job.created_at).getTime() > 3600000 || job.attempts > 12) {
          await accessDb.query("UPDATE public.order_push_jobs SET finished_at=now(),last_error='Expired' WHERE id=$1", [job.id]);
          continue;
        }
        let result: any;
        if (job.ticket_id) {
          const response = await expo('getReceipts', { ids: [job.ticket_id] });
          result = response.data?.[job.ticket_id];
          if (!result) { await accessDb.query("UPDATE public.order_push_jobs SET next_attempt_at=now()+interval '2 minutes' WHERE id=$1", [job.id]); continue; }
        } else {
          const response = await expo('send', [orderPushMessage(job)]);
          result = response.data?.[0];
          if (result?.status === 'ok' && typeof result.id === 'string') {
            await accessDb.query("UPDATE public.order_push_jobs SET ticket_id=$2,next_attempt_at=now()+interval '15 minutes' WHERE id=$1", [job.id, result.id]);
            continue;
          }
        }
        if (result?.status === 'ok') {
          await accessDb.query('UPDATE public.order_push_jobs SET finished_at=now() WHERE id=$1', [job.id]);
        } else if (result?.details?.error === 'DeviceNotRegistered') {
          await accessDb.query('DELETE FROM public.order_push_devices WHERE token=$1 AND session_hash=$2', [job.token, job.session_hash]);
          await accessDb.query("UPDATE public.order_push_jobs SET finished_at=now(),last_error='DeviceNotRegistered' WHERE id=$1", [job.id]);
        } else {
          throw new Error('PushRejected');
        }
      } catch {
        await accessDb.query("UPDATE public.order_push_jobs SET last_error='DeliveryPending',next_attempt_at=now()+($2::int*interval '1 second') WHERE id=$1", [job.id, Math.min(900, 15 * 2 ** Math.min(job.attempts, 6))]);
        console.warn('Notificación pendiente; se reintentará.');
      }
    }
  } catch { console.error('No se pudo procesar la cola de notificaciones.'); }
  finally { running = false; }
}
export function startPushWorker() {
  void drainPushJobs();
  const timer = setInterval(() => void drainPushJobs(), 30000);
  timer.unref();
}
