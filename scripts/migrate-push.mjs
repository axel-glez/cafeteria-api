import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='10s'");
  await db.query(await fs.readFile(new URL('../prisma/sql/006_push_notifications.sql', import.meta.url), 'utf8'));
  await db.query('COMMIT');
  console.log('Tablas privadas de notificaciones listas.');
} catch {
  await db.query('ROLLBACK').catch(() => {});
  console.error('No se pudo preparar notificaciones; revisa conexión y permisos.');
  process.exitCode = 1;
} finally { await db.end(); }
