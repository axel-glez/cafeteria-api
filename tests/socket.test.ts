import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { emitOrderStatusUpdated, orderRoom } from '../src/lib/socket';

test('room y evento de pedido validan UUID, estado y fecha', () => {
  const id = randomUUID();
  assert.equal(orderRoom(id), `order:${id}`);
  const payload = emitOrderStatusUpdated({ id, status: 'ready', updated_at: '2026-09-22T20:00:00.000Z' });
  assert.deepEqual(payload, { orderId: id, status: 'ready', updatedAt: '2026-09-22T20:00:00.000Z' });
  assert.throws(() => orderRoom('../todos'));
  assert.throws(() => emitOrderStatusUpdated({ id, status: 'pending', updated_at: new Date() }));
});
