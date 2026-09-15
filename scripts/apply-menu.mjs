import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs/promises';
const plan=JSON.parse(await fs.readFile('C:/Users/Axel/Downloads/cafeadmin/catalog-maintenance/menu-plan.json','utf8'));
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const key='menu-photos-2026-09-10-v1';
try {
 await db.connect(); await db.query('BEGIN');
 await db.query("SET LOCAL lock_timeout='10s'");
 await db.query('LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE');
 await db.query(`CREATE TABLE IF NOT EXISTS cafe_access.catalog_backups(key text PRIMARY KEY,before_data jsonb NOT NULL,after_data jsonb,created_at timestamptz NOT NULL DEFAULT now())`);
 await db.query('REVOKE ALL ON cafe_access.catalog_backups FROM PUBLIC');
 if((await db.query('SELECT 1 FROM cafe_access.catalog_backups WHERE key=$1',[key])).rowCount) throw new Error('Esta importación ya se aplicó. No se repetirán ni sobrescribirán cambios.');
 const before=(await db.query('SELECT * FROM public.products ORDER BY id')).rows;
 await db.query('INSERT INTO cafe_access.catalog_backups(key,before_data) VALUES($1,$2)',[key,JSON.stringify(before)]);
 await db.query(await fs.readFile('prisma/sql/003_product_variants.sql','utf8'));
 const changes=[];
 const hot=new Set(['Café Americano','Espresso Americano','Café Late','Late Vainilla','Capuchino Italiano','Moka / Moka Blanco','Café Caramelo','Espresso','Chocolate','Cacao','Té','Tisana','Chai','Matcha','Taro']);
 for(const product of before) {
  let description=plan.descriptions[product.name] || product.description;
  if(product.category==='bebida' && product.name!=='Hazlo Latte') {
   description=(hot.has(product.name)?'Bebida caliente: ':product.name.includes('Frapé')||['Moka','Moka Blanco'].includes(product.name)?'Bebida frappé: ':'Bebida fría: ')+product.name.replace(/\s*\(Frapé sin cafeína\)/i,'').replace(/\s+/g,' ').trim()+'.';
  }
  const name=product.name==='Moka'?'Frapé Moka':product.name==='Moka Blanco'?'Frapé Moka Blanco':product.name;
  const sizes=plan.sizes[product.name] || [{label:'Único',price:plan.prices[product.name] ?? Number(product.price),volume_ml:null}];
  const price=Math.min(...sizes.map(size=>size.price));
  await db.query('UPDATE public.products SET name=$1,description=$2,price=$3 WHERE id=$4',[name,description,price,product.id]);
  await db.query('DELETE FROM public.product_variants WHERE product_id=$1',[product.id]);
  for(const [position,size] of sizes.entries()) await db.query('INSERT INTO public.product_variants(product_id,label,volume_ml,price,position) VALUES($1,$2,$3,$4,$5)',[product.id,size.label,size.volume_ml,size.price,position]);
  if(name!==product.name||description!==product.description||price!==Number(product.price)||sizes.length>1) changes.push({id:product.id,before:{name:product.name,description:product.description,price:product.price},after:{name,description,price,variants:sizes}});
 }
 const after=(await db.query('SELECT * FROM public.products ORDER BY id')).rows;
 if(before.length!==after.length || before.some((row,i)=>row.id!==after[i].id||row.image!==after[i].image||row.available!==after[i].available)) throw new Error('No se conservaron los productos originales');
 const duplicates=(await db.query('SELECT lower(trim(name)) AS name,count(*)::int AS count FROM public.products GROUP BY lower(trim(name)) HAVING count(*)>1')).rows;
 const report={key,productsPreserved:after.length,exactNameDuplicates:duplicates,changedProducts:changes.length,productsWithSizes:Object.keys(plan.sizes).length,changes,pending:plan.pending};
 await db.query('UPDATE cafe_access.catalog_backups SET after_data=$1 WHERE key=$2',[JSON.stringify(report),key]);
 await db.query('COMMIT');
 await fs.writeFile('C:/Users/Axel/Downloads/cafeadmin/catalog-maintenance/applied-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({productsPreserved:after.length,exactNameDuplicates:duplicates,changedProducts:changes.length,productsWithSizes:Object.keys(plan.sizes).length,backup:key}));
} catch(error) {await db.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}finally{await db.end();}
