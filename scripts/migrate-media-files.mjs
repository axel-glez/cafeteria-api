import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query(await fs.readFile(new URL('../prisma/sql/010_media_files.sql', import.meta.url), 'utf8'));
  console.log('Migración de archivos aplicada.');
} finally { await db.end(); }
