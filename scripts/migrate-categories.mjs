import "dotenv/config";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

const fingerprint = `SELECT count(*)::int AS count,
  md5(coalesce(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS hash
  FROM public.products p`;

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query("LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE");
  const before = (await client.query(fingerprint)).rows[0];
  const sql = await fs.readFile(new URL("../prisma/sql/001_categories.sql", import.meta.url), "utf8");
  await client.query(sql);
  const after = (await client.query(fingerprint)).rows[0];
  assert.deepEqual(after, before, "Los productos deben conservar exactamente sus datos");
  const categories = (await client.query("SELECT count(*)::int AS count FROM public.categories")).rows[0].count;
  await client.query("COMMIT");
  console.log(JSON.stringify({ productsPreserved: after.count, categoriesCreated: categories }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("No se aplicó la migración:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
