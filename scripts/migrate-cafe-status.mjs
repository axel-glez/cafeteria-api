import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='10s'");
  await db.query(await fs.readFile(new URL('../prisma/sql/007_cafe_status.sql', import.meta.url), 'utf8'));
  await db.query('COMMIT');
  console.log('Control de apertura/cierre preparado. Se conserva cualquier estado existente.');
} catch {
  await db.query('ROLLBACK').catch(() => {});
  console.error('No se pudo preparar el estado de la cafetería; revisa DATABASE_URL y permisos.');
  process.exitCode = 1;
} finally { await db.end(); }
