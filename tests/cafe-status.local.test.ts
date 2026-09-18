import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Siempre aislado: no lee ni modifica la base configurada por el desarrollador.
process.env.DATABASE_URL = 'postgresql://local:local@127.0.0.1:1/local_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SERVE_FRONTEND = 'false';
process.env.NODE_ENV = 'test';

test('Apertura/cierre: rutas reales y SQL en PostgreSQL en memoria', { timeout: 60000 }, async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  const migration = readFileSync(new URL('../prisma/sql/007_cafe_status.sql', import.meta.url), 'utf8');
  const schema = execFileSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  // La tabla nueva se crea con su migración real, incluido CHECK(id=1).
  await db.exec(schema.replace(/CREATE TABLE "cafe_settings" \([\s\S]*?\n\);/, ''));
  await db.exec(readFileSync(new URL('../prisma/sql/002_access.sql', import.meta.url), 'utf8'));
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(readFileSync(new URL('../prisma/sql/006_push_notifications.sql', import.meta.url), 'utf8'));
  await db.exec(migration);

  const { accessDb, tokenHash } = await import('../src/lib/access');
  const { prisma } = await import('../src/lib/prisma');
  t.after(() => prisma.$disconnect());
  t.after(() => accessDb.end());
  const { Prisma } = await import('../src/generated/prisma/client');
  const query = async (sql: string, params: unknown[] = []) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows || result.rows.length };
  };
  // Solo el transporte se adapta; los SQL de estado, permisos y pedidos son los reales.
  t.mock.method(accessDb, 'query', query);
  t.mock.method(accessDb, 'connect', async () => ({ query, release() {} }));
  const { app } = await import('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Cafe-Request': '1' };
  const accountId = randomUUID(), adminToken = randomBytes(32).toString('hex');
  const adminHeaders = { ...headers, Cookie: `cafe_session=${adminToken}` };
  await db.query("INSERT INTO cafe_access.accounts(id,username,password_hash,role) VALUES ($1,'local_admin','test','admin')", [accountId]);
  await db.query("INSERT INTO cafe_access.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash(adminToken), accountId]);
  const categoryId = randomUUID(), productId = randomUUID(), presentationId = randomUUID(), variantId = randomUUID();
  await db.query("INSERT INTO categories(id,name) VALUES($1,'Café')", [categoryId]);
  await db.query("INSERT INTO products(id,name,description,image,category_id) VALUES($1,'Café de prueba','Prueba local','assets/product-placeholder.svg',$2)", [productId, categoryId]);
  await db.query("INSERT INTO presentations(id,key,label) VALUES($1,'unico','Único')", [presentationId]);
  await db.query('INSERT INTO product_variants(id,product_id,presentation_id,price) VALUES($1,$2,$3,35)', [variantId, productId, presentationId]);
  // El catálogo no es objeto de esta prueba; conserva un producto para comprobar que cerrar no lo oculta.
  const originalFindMany = prisma.products.findMany;
  t.after(() => { prisma.products.findMany = originalFindMany; });
  prisma.products.findMany = (async () => [{
    id: productId, name: 'Café de prueba', description: 'Prueba local', image: 'assets/product-placeholder.svg', category_id: categoryId, available: true, archived: false,
    category_details: { id: categoryId, name: 'Café' }, modifier_groups: [],
    variants: [{ id: variantId, product_id: productId, presentation_id: presentationId, price: new Prisma.Decimal(35), available: true, archived: false, position: 0,
      presentation: { id: presentationId, key: 'unico', label: 'Único', volume_ml: null } }],
  }]) as typeof prisma.products.findMany;
  const request = (method: string, route: string, body?: unknown, requestHeaders = headers) => fetch(base + route, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  async function json(method: string, route: string, body?: unknown, status = 200, requestHeaders = headers) {
    const response = await request(method, route, body, requestHeaders);
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  async function setOpen(is_open: boolean) {
    const current = await json('GET', '/cafeteria', undefined, 200, adminHeaders);
    return json('PATCH', '/cafeteria', { is_open, expected_updated_at: current.updated_at }, 200, adminHeaders);
  }
  const session = await json('POST', '/api/v1/sesiones', {}, 201);
  const customer = { ...headers, Authorization: `Bearer ${session.token}`, 'Idempotency-Key': randomUUID() };
  const draft = { items: [{ variant_id: variantId, quantity: 1, option_ids: [] }] };
  let orderId = '';
  try {
    await t.test('migración repetible, estado persistente y tabla no accesible por roles públicos', async () => {
      await db.query('UPDATE cafe_settings SET is_open=false WHERE id=1');
      await db.exec(migration);
      assert.equal((await json('GET', '/api/v1/cafeteria')).is_open, false);
      await assert.rejects(() => db.query('INSERT INTO cafe_settings(id) VALUES(2)'));
      const result = await db.query<{ permitted: boolean }>("SELECT has_table_privilege('anon','public.cafe_settings','UPDATE') OR has_table_privilege('authenticated','public.cafe_settings','UPDATE') AS permitted");
      assert.equal(result.rows[0].permitted, false);
    });
    await t.test('solo administrador cambia el estado; lectura pública y de empleados permitida', async () => {
      assert.equal((await request('PATCH', '/cafeteria', { is_open: true })).status, 401);
      assert.equal((await request('PATCH', '/api/v1/cafeteria', { is_open: true })).status, 404);
      await db.query("UPDATE cafe_access.accounts SET role='employee' WHERE id=$1", [accountId]);
      await json('GET', '/cafeteria', undefined, 200, adminHeaders);
      assert.equal((await request('PATCH', '/cafeteria', { is_open: true }, adminHeaders)).status, 403);
      await db.query("UPDATE cafe_access.accounts SET role='admin' WHERE id=$1", [accountId]);
      await json('PATCH', '/cafeteria', { is_open: 'false' }, 400, adminHeaders);
    });
    await t.test('cerrada mantiene catálogo y rechaza pedidos sin insertar filas', async () => {
      const catalog = await json('GET', '/api/v1/catalogo');
      assert.equal(catalog.products[0].id, productId);
      assert.equal(catalog.cafeteria.is_open, false);
      const rejected = await json('POST', '/api/v1/pedidos', draft, 409, customer);
      assert.equal(rejected.code, 'CAFE_CLOSED');
      assert.equal((await db.query('SELECT * FROM orders')).rows.length, 0);
    });
    await t.test('abrir permite comprar y cerrar permite recuperar el mismo pedido sin duplicarlo', async () => {
      await setOpen(true);
      const order = await json('POST', '/api/v1/pedidos', draft, 201, customer);
      orderId = order.id;
      assert.equal(order.total, '35.00');
      await setOpen(false);
      const replay = await json('POST', '/api/v1/pedidos', draft, 200, customer);
      assert.equal(replay.id, order.id);
      assert.equal((await json('GET', '/api/v1/pedidos/' + order.id, undefined, 200, customer)).id, order.id);
      assert.equal((await db.query('SELECT * FROM orders')).rows.length, 1);
      await json('POST', '/api/v1/pedidos', draft, 409, { ...customer, 'Idempotency-Key': randomUUID() });
    });
    await t.test('los pedidos existentes siguen atendiéndose durante el cierre', async () => {
      const updated = await json('PATCH', '/pedidos/' + orderId + '/estado', { from_status: 'new', status: 'preparing' }, 200, adminHeaders);
      assert.equal(updated.status, 'preparing');
      const board = await json('GET', '/pedidos', undefined, 200, adminHeaders);
      assert.equal(board.orders[0].id, orderId);
    });
    await t.test('un panel desactualizado no sobrescribe un cambio más reciente', async () => {
      const old = await json('GET', '/api/v1/cafeteria');
      const opened = await setOpen(true);
      assert.notEqual(opened.updated_at, old.updated_at);
      const conflict = await json('PATCH', '/cafeteria', { is_open: false, expected_updated_at: old.updated_at }, 409, adminHeaders);
      assert.equal(conflict.code, 'CAFE_STATE_CHANGED');
      assert.equal((await json('GET', '/api/v1/cafeteria')).is_open, true);
    });
    await t.test('si falta el estado se rechazan pedidos nuevos', async () => {
      await db.query('DELETE FROM cafe_settings WHERE id=1');
      await json('GET', '/api/v1/cafeteria', undefined, 503);
      await json('POST', '/api/v1/pedidos', draft, 503, { ...customer, 'Idempotency-Key': randomUUID() });
      assert.equal((await db.query('SELECT * FROM orders')).rows.length, 1);
    });
  } finally {
    t.mock.restoreAll();
  }
});
