import 'dotenv/config';import pg from 'pg';
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try{
 await c.connect();
 const result=await c.query(`WITH original AS (SELECT v.* FROM cafe_access.catalog_backups b, jsonb_to_recordset(b.before_data->'product_variants') v(id uuid,product_id uuid,price numeric,volume_ml integer) WHERE b.key='normalized-catalog-orders-v1') SELECT count(*)::int original_variants,count(*) FILTER(WHERE v.id IS NULL)::int missing_ids,count(*) FILTER(WHERE v.price<>o.price)::int changed_prices,count(*) FILTER(WHERE s.volume_ml IS DISTINCT FROM o.volume_ml)::int changed_volumes FROM original o LEFT JOIN public.product_variants v ON v.id=o.id LEFT JOIN public.presentations s ON s.id=v.presentation_id`);
 const counts=(await c.query('SELECT (SELECT count(*) FROM public.products)::int products,(SELECT count(*) FROM public.products WHERE NOT archived)::int active,(SELECT count(*) FROM public.product_variants)::int variants,(SELECT count(*) FROM public.orders)::int orders,(SELECT count(*) FROM public.presentations)::int presentations')).rows[0];
 console.log(JSON.stringify({preservation:result.rows[0],counts}));
 // Ajustar la mayúscula inicial de descripciones; conservar respaldo y precios.
 const lowercase=(await c.query("SELECT id,description FROM public.products WHERE description ~ '^[a-záéíóúüñ]'")).rows;
 if(lowercase.length){await c.query('BEGIN');await c.query('INSERT INTO cafe_access.catalog_backups(key,before_data) VALUES($1,$2)',['catalog-spelling-final-v1',JSON.stringify(lowercase)]);for(const p of lowercase)await c.query('UPDATE public.products SET description=$1 WHERE id=$2',[p.description.charAt(0).toUpperCase()+p.description.slice(1),p.id]);await c.query('COMMIT');console.log('Mayúscula inicial corregida en '+lowercase.length+' descripción.');}
 if(result.rows[0].missing_ids||result.rows[0].changed_prices||result.rows[0].changed_volumes)process.exitCode=1;
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await c.end();}
