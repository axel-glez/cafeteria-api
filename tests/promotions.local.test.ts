import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Nunca usar DATABASE_URL del usuario en estas verificaciones.
process.env.DATABASE_URL = 'postgresql://local:local@127.0.0.1:1/promotions_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SERVE_FRONTEND = 'false';
process.env.NODE_ENV = 'test';
process.env.MOBILE_ORIGINS = 'http://localhost:5181';

test('Promociones: migración y rutas reales sobre PostgreSQL en memoria', { timeout: 60000 }, async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(readFileSync(new URL('../prisma/sql/002_access.sql', import.meta.url), 'utf8'));
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE orders(id integer); INSERT INTO orders VALUES(1);');
  const migration = readFileSync(new URL('../prisma/sql/009_promotions.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const { accessDb, tokenHash } = await import('../src/lib/access');
  t.after(() => accessDb.end());
  const query = async (sql: string, values: unknown[] = []) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows || result.rows.length };
  };
  t.mock.method(accessDb, 'query', query);
  t.mock.method(accessDb, 'connect', async () => ({ query, release() {} }));
  const { app } = await import('../src/app');
  const { prisma } = await import('../src/lib/prisma');
  t.after(() => prisma.$disconnect());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Cafe-Request': '1' };
  const account = randomUUID(), token = randomBytes(32).toString('hex');
  const admin = { ...headers, Cookie: `cafe_session=${token}` };
  await db.query("INSERT INTO cafe_access.accounts(id,username,password_hash,role) VALUES($1,'promo_admin','test','admin')", [account]);
  await db.query("INSERT INTO cafe_access.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash(token), account]);
  const request = (method: string, route: string, body?: unknown, h: Record<string, string> = headers) => fetch(base + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (method: string, route: string, body?: unknown, status = 200, h = headers) => {
    const response = await request(method, route, body, h);
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  const announcement = { id: randomUUID(), label: 'NOVEDADES', title: 'Tu pausa', description: 'Café para tu día', image: '', active: true };
  let revision = 0;
  await t.test('vacío sin anuncios ficticios, permisos y CORS', async () => {
    assert.deepEqual(await json('GET', '/api/v1/promociones'), { items: [] });
    await json('GET', '/promociones', undefined, 401);
    await json('PUT', '/promociones', {}, 401);
    await db.query("UPDATE cafe_access.accounts SET role='employee' WHERE id=$1", [account]);
    await json('GET', '/promociones', undefined, 403, admin);
    await json('PUT', '/promociones', {}, 403, admin);
    await db.query("UPDATE cafe_access.accounts SET role='admin' WHERE id=$1", [account]);
    await json('PUT', '/api/v1/promociones', {}, 404);
    await json('PUT', '/promociones', {}, 403, { ...admin, Origin: 'https://foreign.test' });
    const mobile = await request('GET', '/api/v1/promociones', undefined, { Origin: 'http://localhost:5181' });
    assert.equal(mobile.headers.get('access-control-allow-origin'), 'http://localhost:5181');
  });
  await t.test('crear, editar, ordenar, ocultar y compartir entre clientes', async () => {
    const hidden = { ...announcement, id: randomUUID(), title: 'Oculto', active: false };
    const second = { ...announcement, id: randomUUID(), title: 'Segundo', image: 'assets/cappuccino.jpg' };
    let data = await json('PUT', '/promociones', { items: [announcement, hidden, second], expected_revision: revision }, 200, admin);
    revision = data.revision;
    assert.deepEqual((await json('GET', '/api/v1/promociones')).items.map((p: any) => p.title), ['Tu pausa', 'Segundo']);
    data = await json('PUT', '/promociones', { items: [second, { ...announcement, title: 'Editado' }, hidden], expected_revision: revision }, 200, admin);
    revision = data.revision;
    assert.deepEqual((await json('GET', '/api/v1/promociones')).items.map((p: any) => p.title), ['Segundo', 'Editado']);
    assert.equal((await json('GET', '/promociones', undefined, 200, admin)).items.length, 3);
  });
  await t.test('rechaza panel antiguo, campos inválidos e imágenes no autorizadas', async () => {
    const stale = await json('PUT', '/promociones', { items: [], expected_revision: 0 }, 409, admin);
    assert.equal(stale.code, 'PROMOTIONS_CHANGED');
    for (const p of [{ ...announcement, title: ' ' }, { ...announcement, title: 'a'.repeat(71) }, { ...announcement, description: 'a'.repeat(181) }, { ...announcement, active: 'true' }, { ...announcement, image: 'javascript:alert(1)' }, { ...announcement, image: 'http://example.com/a.jpg' }, { ...announcement, image: 'https://not-allowed.test/a.png' }, { ...announcement, image: 'assets/../secret.png' }, { ...announcement, price: 1 }]) {
      await json('PUT', '/promociones', { items: [p], expected_revision: revision }, 400, admin);
    }
    await json('PUT', '/promociones', { items: [announcement, announcement], expected_revision: revision }, 400, admin);
    await json('PUT', '/promociones', { items: Array.from({ length: 13 }, () => ({ ...announcement, id: randomUUID() })), expected_revision: revision }, 400, admin);
    assert.equal((await json('GET', '/promociones', undefined, 200, admin)).revision, revision);
  });
  await t.test('migración repetible conserva datos, RLS y pedidos intactos', async () => {
    const before = await json('GET', '/promociones', undefined, 200, admin);
    await db.exec(migration);
    assert.deepEqual(await json('GET', '/promociones', undefined, 200, admin), before);
    assert.equal((await db.query('SELECT * FROM orders')).rows.length, 1);
    const grants = await db.query<{ allowed: boolean }>("SELECT has_table_privilege('anon','public.promotion_settings','SELECT') OR has_table_privilege('authenticated','public.promotion_settings','UPDATE') AS allowed");
    assert.equal(grants.rows[0].allowed, false);
    assert.equal((await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid='public.promotion_settings'::regclass")).rows[0].relrowsecurity, true);
  });
  await t.test('doce anuncios largos admitidos; ocultar todos devuelve lista vacía', async () => {
    const full = Array.from({ length: 12 }, () => ({ ...announcement, id: randomUUID(), title: 'á'.repeat(70), description: 'é'.repeat(180), image: 'https://www.nespresso.com/' + 'a'.repeat(950), active: false }));
    const saved = await json('PUT', '/promociones', { items: full, expected_revision: revision }, 200, admin);
    revision = saved.revision;
    assert.deepEqual(await json('GET', '/api/v1/promociones'), { items: [] });
    await json('PUT', '/promociones', { items: [], expected_revision: revision }, 200, admin);
  });
  await t.test('carga de los cuatro anuncios solicitados es repetible y conserva ediciones', async () => {
    const { appendPromotions } = await import('../src/lib/promotions');
    const supplied = JSON.parse(readFileSync(new URL('../content/promotions-2026-09-22.json', import.meta.url), 'utf8'));
    assert.equal(await appendPromotions(supplied), 4);
    const data = await json('GET', '/promociones', undefined, 200, admin);
    assert.deepEqual(data.items.map((p: any) => p.title), ['Lunes en pareja', 'Miércoles Frescholes', 'Viernes de mal tercio', 'Chamoyada de mango']);
    assert.match(data.items[0].description, /16 oz.*20 oz.*\$150/);
    assert.match(data.items[1].description, /12 oz.*\$46/);
    assert.match(data.items[2].description, /2 a 3 pm/);
    assert.match(data.items[3].description, /20 oz.*\$65/);
    data.items[0].title = 'Edición del administrador';
    data.items[1].active = false;
    const edited = await json('PUT', '/promociones', { items: data.items, expected_revision: data.revision }, 200, admin);
    assert.equal(await appendPromotions(supplied), 0);
    assert.deepEqual(await json('GET', '/promociones', undefined, 200, admin), edited);
    await assert.rejects(() => appendPromotions(Array.from({ length: 12 }, () => ({ ...announcement, id: randomUUID() }))));
    assert.deepEqual(await json('GET', '/promociones', undefined, 200, admin), edited);
  });
  await t.test('falta de migración se informa sin afectar health', async () => {
    await db.exec('DROP TABLE promotion_settings');
    const result = await json('GET', '/api/v1/promociones', undefined, 503);
    assert.equal(result.code, 'PROMOTIONS_UNAVAILABLE');
    await json('GET', '/health');
  });
});
