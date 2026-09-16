export const pushTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
export function orderPushMessage(job: { token: string; order_id: string; status: string; folio: string }) {
  const messages: Record<string, string> = {
    preparing: 'Ya estamos preparando tu pedido.',
    ready: 'Tu pedido está listo. ¡Pasa a recogerlo!',
    delivered: 'Tu pedido fue entregado. ¡Buen provecho!',
    cancelled: 'Tu pedido fue cancelado. Consulta con la cafetería.',
  };
  if (!messages[job.status]) throw new Error('Estado de notificación inválido');
  return {
    to: job.token, title: `Buster’s · ${job.folio}`, body: messages[job.status],
    sound: 'default', channelId: 'orders', priority: 'high', ttl: 3600,
    data: { orderId: job.order_id, status: job.status },
  };
}
