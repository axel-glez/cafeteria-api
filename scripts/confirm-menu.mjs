import 'dotenv/config';import pg from 'pg';import fs from 'node:fs/promises';
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const key='menu-confirmed-2026-09-10-v2';
try {
 await c.connect();await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='10s'");await c.query('LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE');
 if((await c.query('SELECT 1 FROM cafe_access.catalog_backups WHERE key=$1',[key])).rowCount)throw new Error('Confirmación ya aplicada');
 const before={products:(await c.query('SELECT * FROM public.products ORDER BY id')).rows,variants:(await c.query('SELECT * FROM public.product_variants ORDER BY product_id,position')).rows};
 await c.query('INSERT INTO cafe_access.catalog_backups(key,before_data) VALUES ($1,$2)',[key,JSON.stringify(before)]);
 await c.query(await fs.readFile('prisma/sql/004_archive_duplicates.sql','utf8'));
 for(const [name,price] of [['Bagel De Pavo Y Queso',65],['Nohoch Dog',57]]) {
  const r=await c.query('UPDATE public.products SET price=$1 WHERE name=$2 AND archived=false RETURNING id',[price,name]);if(r.rowCount!==1)throw new Error('Producto ambiguo: '+name);
  await c.query('UPDATE public.product_variants SET price=$1 WHERE product_id=$2',[price,r.rows[0].id]);
 }
 const espresso=await c.query("SELECT id FROM public.products WHERE name='Espresso' AND archived=false");if(espresso.rowCount!==1)throw new Error('Espresso ambiguo');
 await c.query('DELETE FROM public.product_variants WHERE product_id=$1',[espresso.rows[0].id]);
 for(const [position,label,price] of [[0,'Sencillo',37],[1,'Doble',39],[2,'Cortado',43]])await c.query('INSERT INTO public.product_variants(product_id,label,price,position) VALUES($1,$2,$3,$4)',[espresso.rows[0].id,label,price,position]);
 await c.query('UPDATE public.products SET price=37 WHERE id=$1',[espresso.rows[0].id]);
 const duplicate=await c.query("SELECT id FROM public.products WHERE name='Helado Vainilla' AND archived=false");
 const canonical=await c.query("SELECT id FROM public.products WHERE name='Helado Late Vainilla' AND archived=false");
 if(duplicate.rowCount!==1||canonical.rowCount!==1)throw new Error('No se identificaron ambas fichas');
 await c.query('UPDATE public.products SET archived=true WHERE id=$1',[duplicate.rows[0].id]);
 const counts=(await c.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE archived=false)::int AS visible FROM public.products')).rows[0];
 const report={key,counts,archivedId:duplicate.rows[0].id,canonicalId:canonical.rows[0].id,confirmed:{bagel:65,nohoch:57,espresso:[37,39,43],latteVainilla:[65,72,77]}};
 await c.query('UPDATE cafe_access.catalog_backups SET after_data=$1 WHERE key=$2',[JSON.stringify(report),key]);await c.query('COMMIT');
 await fs.writeFile('C:/Users/Axel/Downloads/cafeadmin/catalog-maintenance/confirmed-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await c.end();}
