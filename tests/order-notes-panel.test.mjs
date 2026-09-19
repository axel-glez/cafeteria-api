import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('panel muestra indicaciones como texto seguro y omite el apartado vacío', () => {
  const source = readFileSync(new URL('../public/js/features/orders.js', import.meta.url), 'utf8');
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '' }); return nodes.get(id); };
  const order = { id: 'test-order', folio: 'B-1', created_at: new Date().toISOString(), status: 'new', items: [], total: '35.00', notes: 'Sin mostaza\n<img src=x onerror="alert(1)"> & más' };
  const App = { data: { orders: [order], orderStatuses: [{ id: 'new', label: 'Nuevos' }] }, elements: { ordersBoard: node('board') } };
  runInNewContext(source, { window: { BustersAdmin: App }, document: { getElementById: node, querySelectorAll: () => [] } });
  App.orders.renderOrders();
  assert.match(node('board').innerHTML, /Indicaciones especiales/);
  assert.match(node('board').innerHTML, /Sin mostaza\n&lt;img/);
  assert.ok(!node('board').innerHTML.includes('<img'));
  order.notes = '';
  App.orders.renderOrders();
  assert.ok(!node('board').innerHTML.includes('Indicaciones especiales'));
});
