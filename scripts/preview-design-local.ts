// Verificación visual AISLADA. Solo localhost, PostgreSQL en memoria, sin datos reales.
// Nunca importar este archivo desde src/app.ts ni usarlo para desplegar.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';

process.env.DATABASE_URL = 'postgresql://local:local@127.0.0.1:1/visual_in_memory';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SERVE_FRONTEND = 'true';
process.env.FRONTEND_DIR = path.resolve('public');
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://127.0.0.1:5182';
process.env.MOBILE_ORIGINS = 'http://127.0.0.1:5181';
const db = await PGlite.create();
const schema = execFileSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
await db.exec(schema);
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for (const name of ['002_access.sql', '006_push_notifications.sql', '007_cafe_status.sql', '009_promotions.sql']) {
  await db.exec(readFileSync(new URL('../prisma/sql/' + name, import.meta.url), 'utf8'));
}
const { accessDb, tokenHash } = await import('../src/lib/access');
const { prisma } = await import('../src/lib/prisma');
const { Prisma } = await import('../src/generated/prisma/client');
const query = async (sql: string, params: unknown[] = []) => {
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.affectedRows || result.rows.length };
};
// Únicamente este proceso reemplaza el transporte a PostgreSQL.
accessDb.query = query as typeof accessDb.query;
accessDb.connect = (async () => ({ query, release() {} })) as unknown as typeof accessDb.connect;
const category = randomUUID(), product = randomUUID(), presentation = randomUUID(), variant = randomUUID();
await db.query("INSERT INTO categories(id,name) VALUES($1,'Café')", [category]);
await db.query("INSERT INTO products(id,name,description,image,category_id) VALUES($1,'Café de prueba','Solo para verificación local. No es un producto real.','assets/cappuccino.jpg',$2)", [product, category]);
await db.query("INSERT INTO presentations(id,key,label) VALUES($1,'unico','Único')", [presentation]);
await db.query('INSERT INTO product_variants(id,product_id,presentation_id,price) VALUES($1,$2,$3,35)', [variant, product, presentation]);
prisma.products.findMany = (async () => [{
  id: product, name: 'Café de prueba', description: 'Solo para verificación local. No es un producto real.', image: 'assets/cappuccino.jpg', category_id: category, available: true, archived: false,
  category_details: { id: category, name: 'Café' }, modifier_groups: [],
  variants: [{ id: variant, product_id: product, presentation_id: presentation, price: new Prisma.Decimal(35), available: true, archived: false, position: 0,
    presentation: { id: presentation, key: 'unico', label: 'Único', volume_ml: null } }],
}]) as typeof prisma.products.findMany;
prisma.categories.findMany = (async () => [{ id: category, name: 'Café', created_at: new Date() }]) as typeof prisma.categories.findMany;
prisma.modifier_groups.findMany = (async () => []) as typeof prisma.modifier_groups.findMany;
const account = randomUUID(), token = randomBytes(32).toString('hex');
await db.query("INSERT INTO cafe_access.accounts(id,username,password_hash,role) VALUES($1,'vista_local','not-a-login-password','admin')", [account]);
await db.query("INSERT INTO cafe_access.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash(token), account]);
await db.query('UPDATE promotion_settings SET items=$1::jsonb WHERE id=1', [readFileSync(new URL('../content/promotions-2026-09-22.json', import.meta.url), 'utf8')]);
const { app } = await import('../src/app');
const panel = express();
panel.use((req, _res, next) => { req.headers.cookie = `cafe_session=${token}`; next(); });
panel.get('/', (_req, res) => res.type('html').send(readFileSync('public/index.html', 'utf8').replace('<body>', '<body><div style="padding:10px;background:#ffdfaa;color:#302314;text-align:center">VISTA LOCAL · DATOS EN MEMORIA · NO PRODUCCIÓN</div>')));
panel.use(app);
const panelServer = panel.listen(5182, '127.0.0.1', () => console.log('Panel aislado: http://127.0.0.1:5182'));
const preview = express();
const buildDir = path.resolve('../bustersDog-main/my-app/dist-preview');
preview.use(express.static(buildDir, { extensions: ['html'] }));
preview.use((_req, res) => res.sendFile(path.join(buildDir, 'index.html')));
const appServer = preview.listen(5181, '127.0.0.1', () => console.log('App aislada: http://127.0.0.1:5181/products/'));
async function close() {
  panelServer.close(); appServer.close(); await db.close(); await accessDb.end(); await prisma.$disconnect(); process.exit(0);
}
process.on('SIGINT', close); process.on('SIGTERM', close);
