export const pushTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
export function orderPushMessage(job: { token: string; order_id: string; status: string; folio: string; product_name: string; additional_products?: number }) {
  const product = job.product_name.trim().slice(0, 90);
  if (!product) throw new Error('El pedido no tiene nombre de producto');
  const additional = Math.max(0, Math.trunc(job.additional_products || 0));
  const products = additional
    ? `${product} y ${additional} ${additional === 1 ? 'producto más' : 'productos más'}`
    : product;
  const messages: Record<string, string> = {
    preparing: `Pedido ${job.folio}: ya estamos preparando ${products}.`,
    ready: `Pedido ${job.folio} listo: ${products}. ¡Pasa a recogerlo!`,
    delivered: `Pedido ${job.folio} entregado: ${products}. ¡Buen provecho!`,
    cancelled: `Pedido ${job.folio} cancelado: ${products}. Consulta con la cafetería.`,
  };
  if (!messages[job.status]) throw new Error('Estado de notificación inválido');
  return {
    to: job.token, title: `Buster’s · Pedido ${job.folio}`, body: messages[job.status],
    sound: 'default', channelId: 'orders', priority: 'high', ttl: 3600,
    data: { orderId: job.order_id, status: job.status, folio: job.folio, productName: product },
  };
}
