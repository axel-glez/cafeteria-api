import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';

const orderIdSchema = z.uuid();
const orderStatusSchema = z.enum(['new', 'preparing', 'ready', 'delivered', 'cancelled']);
let io: Server | undefined;

export const orderRoom = (orderId: string) => `order:${orderIdSchema.parse(orderId)}`;

function allowedOrigins() {
  return new Set([
    process.env.APP_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.MOBILE_ORIGINS || '').split(','),
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value)));
}

export function isSocketOriginAllowed(origin: string | undefined, configured = allowedOrigins()) {
  if (!origin) return true; // React Native y clientes nativos no envían Origin.
  // La web local puede consumir la API HTTPS de Render durante desarrollo.
  // Esto solo habilita el handshake Socket.IO; no concede cookies ni acceso al panel.
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return configured.has(origin);
}

export function initializeSocket(server: HttpServer) {
  if (io) return io;
  const origins = allowedOrigins();
  io = new Server(server, {
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: true },
    cors: {
      origin(origin, callback) {
        const allowed = isSocketOriginAllowed(origin, origins);
        callback(allowed ? null : new Error('Origen no autorizado'), allowed);
      },
      methods: ['GET', 'POST'],
    },
  });
  io.on('connection', socket => {
    if (process.env.NODE_ENV !== 'production') console.info(`[socket] conectado ${socket.id}`);
    socket.on('join-order', (value: unknown) => {
      const parsed = orderIdSchema.safeParse(value);
      if (!parsed.success) return;
      void socket.join(orderRoom(parsed.data));
      if (process.env.NODE_ENV !== 'production') console.info(`[socket] join ${orderRoom(parsed.data)}`);
    });
    socket.on('leave-order', (value: unknown) => {
      const parsed = orderIdSchema.safeParse(value);
      if (!parsed.success) return;
      void socket.leave(orderRoom(parsed.data));
      if (process.env.NODE_ENV !== 'production') console.info(`[socket] leave ${orderRoom(parsed.data)}`);
    });
    socket.on('disconnect', reason => {
      if (process.env.NODE_ENV !== 'production') console.info(`[socket] desconectado ${socket.id}: ${reason}`);
    });
  });
  return io;
}

export function emitOrderStatusUpdated(order: { id: string; status: string; updated_at: Date | string }) {
  const id = orderIdSchema.parse(order.id);
  const payload = {
    orderId: id,
    status: orderStatusSchema.parse(order.status),
    updatedAt: new Date(order.updated_at).toISOString(),
  };
  io?.to(orderRoom(id)).emit('order-status-updated', payload);
  if (process.env.NODE_ENV !== 'production') console.info(`[socket] ${payload.orderId} -> ${payload.status}`);
  return payload;
}
