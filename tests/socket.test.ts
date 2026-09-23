import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { emitOrderStatusUpdated, isSocketOriginAllowed, orderRoom } from '../src/lib/socket';

test('room y evento de pedido validan UUID, estado y fecha', () => {
  const id = randomUUID();
  assert.equal(orderRoom(id), `order:${id}`);
  const payload = emitOrderStatusUpdated({ id, status: 'ready', updated_at: '2026-09-22T20:00:00.000Z' });
  assert.deepEqual(payload, { orderId: id, status: 'ready', updatedAt: '2026-09-22T20:00:00.000Z' });
  assert.throws(() => orderRoom('../todos'));
  assert.throws(() => emitOrderStatusUpdated({ id, status: 'pending', updated_at: new Date() }));
});

test('CORS de Socket.IO permite app nativa, web local y orígenes configurados', () => {
  const configured = new Set(['https://app.busters.example']);
  assert.equal(isSocketOriginAllowed(undefined, configured), true);
  assert.equal(isSocketOriginAllowed('http://127.0.0.1:5180', configured), true);
  assert.equal(isSocketOriginAllowed('http://localhost:8081', configured), true);
  assert.equal(isSocketOriginAllowed('https://app.busters.example', configured), true);
  assert.equal(isSocketOriginAllowed('https://sitio-ajeno.example', configured), false);
  assert.equal(isSocketOriginAllowed('http://127.0.0.1.evil.test:5180', configured), false);
});
