import 'dotenv/config';
import pg from 'pg';

// Solo lectura. No imprime credenciales ni la cadena de conexión.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const required = ['products', 'product_variants', 'orders', 'order_sessions'];
  for (const table of required) {
    const result = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', ['public.' + table]);
    if (!result.rows[0].present) throw new Error('La base no contiene las tablas esperadas de cafetería');
  }
  const exists = (await db.query("SELECT to_regclass('public.cafe_settings') IS NOT NULL AS present")).rows[0].present;
  console.log('Conexión verificada: tablas del catálogo y pedidos presentes.');
  console.log('Tabla de apertura/cierre: ' + (exists ? 'presente' : 'pendiente de crear'));
  if (exists) {
    const rows = (await db.query('SELECT id,is_open,updated_at FROM public.cafe_settings ORDER BY id')).rows;
    if (rows.length !== 1 || rows[0].id !== 1 || typeof rows[0].is_open !== 'boolean') throw new Error('El estado no contiene la fila única esperada');
    const rls = (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.cafe_settings'::regclass")).rows[0].relrowsecurity;
    const constraints = (await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.cafe_settings'::regclass AND contype='c'")).rows;
    const roles = (await db.query("SELECT rolname, has_table_privilege(rolname,'public.cafe_settings','SELECT,INSERT,UPDATE,DELETE') AS has_access FROM pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
    if (!rls || !constraints.some(c => /id\s*=\s*1/.test(c.definition)) || roles.some(r => r.has_access)) throw new Error('Revisar restricciones o permisos de la tabla');
    console.log(JSON.stringify({ is_open: rows[0].is_open, updated_at: rows[0].updated_at, singleton: true, rls: true, public_roles_blocked: true }));
  } else if (process.argv.includes('--require-migrated')) {
    throw new Error('La migración todavía no está aplicada');
  }
  await db.query('COMMIT');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('No se pudo verificar la migración. Código: ' + (error.code || 'VERIFICATION_FAILED'));
  process.exitCode = 1;
} finally { await db.end(); }
