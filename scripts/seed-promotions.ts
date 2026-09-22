// Carga explícita de los anuncios proporcionados por el usuario. No cambia precios.
import { readFileSync } from 'node:fs';
import { accessDb } from '../src/lib/access';
import { appendPromotions } from '../src/lib/promotions';

try {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const count = await appendPromotions(JSON.parse(readFileSync(new URL('../content/promotions-2026-09-22.json', import.meta.url), 'utf8')));
  console.log(`${count} anuncios agregados. Se conservaron los anuncios y ediciones existentes. No se modificaron precios ni pedidos.`);
} catch {
  console.error('No se cargaron anuncios. Revisa la conexión, la migración y que haya espacio (máximo 12).');
  process.exitCode = 1;
} finally { await accessDb.end(); }
