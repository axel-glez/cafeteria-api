import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { accessDb, tokenHash } from '../src/lib/access';
import { adminFixture } from '../tests/auth-fixture';
import { createShopStore } from 'file:///C:/Users/Axel/Downloads/cafeadmin/bustersDog/my-app/src/stores/createShopStore.ts';
import { createApiClient } from 'file:///C:/Users/Axel/Downloads/cafeadmin/bustersDog/my-app/src/services/api-client.ts';
import type { ShoppingSession } from 'file:///C:/Users/Axel/Downloads/cafeadmin/bustersDog/my-app/src/types/product.ts';
const auth = await adminFixture(); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
let productId: string | undefined, categoryId: string | undefined, session: ShoppingSession | null = null, raw: string | null = null;
async function staff(method: string, path: string, body?: unknown) { const response = await fetch(base + path, { method, headers: auth.headers, body: body === undefined ? undefined : JSON.stringify(body) }); assert.ok(response.ok, 'Staff response: ' + response.status); return response.json(); }
try {
  const category = await prisma.categories.create({ data: { name: 'App smoke ' + randomUUID() } }); categoryId = category.id;
  const product = await staff('POST', '/productos', { name: 'Compra temporal ' + randomUUID(), description: 'Solo prueba automática', image: 'assets/product-placeholder.svg', category_id: category.id, variants: [{ label: 'M', price: 35 }, { label: 'G', price: 40 }, { label: '+G', price: 45 }] }); productId = product.id;
  const store = createShopStore({ api: createApiClient(base), uuid: randomUUID, now: Date.now, storage: { read: async () => raw, write: async value => { raw = value; } }, vault: { read: async () => session, write: async value => { session = value; } } });
  await store.getState().hydrate(); assert.equal(await store.getState().loadCatalog(), true);
  const p = store.getState().products.find(p => p.id === product.id)!; assert.deepEqual(p.variants.map(v => v.volume_ml), [350, 470, 590]);
  assert.equal(store.getState().addToCart(p.id, p.variants[0].id, []), true); assert.equal(store.getState().addToCart(p.id, p.variants[0].id, []), true); assert.equal(store.getState().addToCart(p.id, p.variants[1].id, []), true); assert.equal(store.getState().addToCart(p.id, p.variants[2].id, []), false);
  const order = await store.getState().submitOrder(); assert.ok(order, store.getState().error || 'No order'); assert.equal(order.total, '110.00'); assert.equal(order.items.length, 2);
  const board = await staff('GET', '/pedidos?scope=active'); assert.ok(board.orders.some((o: any) => o.id === order.id));
  let from = 'new'; for (const status of ['preparing', 'ready', 'delivered']) { await staff('PATCH', `/pedidos/${order.id}/estado`, { from_status: from, status }); await store.getState().refreshOrder(order.id); assert.equal(store.getState().orders[0].status, status); from = status; }
  console.log(JSON.stringify({ result: 'PASS', flow: 'catalog → cart → API → staff board → preparing → ready → delivered', total: order.total, cartRule: '3 products / 3 units per product', noPersonalData: true }));
} finally {
  if (session) {
    const hash = tokenHash((session as ShoppingSession).token);
    await accessDb.query('DELETE FROM public.order_item_options WHERE item_id IN (SELECT i.id FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.session_hash=$1)', [hash]);
    await accessDb.query('DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE session_hash=$1)', [hash]);
    await accessDb.query('DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE session_hash=$1)', [hash]);
    await accessDb.query('DELETE FROM public.orders WHERE session_hash=$1', [hash]);
    await accessDb.query('DELETE FROM public.order_sessions WHERE token_hash=$1', [hash]);
    await accessDb.query('DELETE FROM cafe_access.login_limits WHERE bucket=$1', ['mobile:orders:' + hash]);
  }
  if (productId) await prisma.products.delete({ where: { id: productId } }); if (categoryId) await prisma.categories.delete({ where: { id: categoryId } });
  server.close(); await prisma.$disconnect(); await auth.cleanup();
}

