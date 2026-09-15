import "dotenv/config";
import fs from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
 await client.connect();
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout = '10s'");
 await client.query(await fs.readFile(new URL('../prisma/sql/002_access.sql', import.meta.url), 'utf8'));
 await client.query('COMMIT');
 console.log('Tablas privadas de acceso listas. No se modificaron productos ni categorías.');
} catch { await client.query('ROLLBACK').catch(() => {}); console.error('No se pudo preparar el acceso. Revisa la conexión y los permisos de la base.'); process.exitCode = 1; }
finally { await client.end(); }
