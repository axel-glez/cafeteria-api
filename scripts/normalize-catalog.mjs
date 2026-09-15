import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs/promises';
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const key='normalized-catalog-orders-v1';
function spelling(value) {
 return value.replace(/\bLate\b/gi,'latte').replace(/Platáno/g,'plátano').replace(/Yogurth|Yoghurt/gi,'yogur')
  .replace(/frappé/gi,'frapé').replace(/mozzarela/gi,'mozzarella').replace(/\bragu\b/gi,'ragú')
  .replace(/\bmix de vegetales\b/gi,'mezcla de vegetales').replace(/(\d)\s*[gG]\)/g,'$1 g)')
  .replace(/Salchicha de pollo capeado/g,'Salchicha de pollo capeada').replace(/Chai\(/g,'Chai (');
}
function sentence(value) {const s=value.toLocaleLowerCase('es');return s.charAt(0).toUpperCase()+s.slice(1);}
try {
 await c.connect();await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='10s'");
 await c.query('LOCK TABLE public.products,public.product_variants,public.categories IN ACCESS EXCLUSIVE MODE');
 if((await c.query('SELECT 1 FROM cafe_access.catalog_backups WHERE key=$1',[key])).rowCount) throw new Error('La migración ya fue aplicada; no se repite.');
 const before={};for(const table of ['products','product_variants','categories'])before[table]=(await c.query('SELECT * FROM public.'+table+' ORDER BY id')).rows;
 await c.query('INSERT INTO cafe_access.catalog_backups(key,before_data) VALUES($1,$2)',[key,JSON.stringify(before)]);
 await c.query(await fs.readFile('prisma/sql/005_normalized_catalog_orders.sql','utf8'));
 const corrections=[];
 for(const p of before.products){
  let name=sentence(spelling(p.name));
  for(const brand of ['Buster Burger','Nohoch Dog','Chapata Pepe','Banderilla Guau','Molletec (2)','Manzana Golden','Plátano Chiapas'])if(p.name===brand) name=brand;
  name=name.replace(/cookies & cream/i,'Cookies & Cream');
  let description=spelling(p.description).replace(/Manchego/g,'manchego');
  if(/^Bebida (caliente|fría|frapé):/.test(description)) description=description.split(':')[0]+': '+name.charAt(0).toLowerCase()+name.slice(1)+'.';
  if(!description.endsWith('.'))description+='.';
  await c.query('UPDATE public.products SET name=$1,description=$2 WHERE id=$3',[name,description,p.id]);
  if(name!==p.name||description!==p.description)corrections.push({id:p.id,before:p.name,name,description});
 }
 async function group(name,min,max,options,productIds){
  const id=(await c.query('INSERT INTO public.modifier_groups(name,min_selections,max_selections) VALUES($1,$2,$3) RETURNING id',[name,min,max])).rows[0].id;
  for(const [label,price] of options)await c.query('INSERT INTO public.modifier_options(group_id,name,price) VALUES($1,$2,$3)',[id,label,price]);
  for(const productId of productIds)await c.query('INSERT INTO public.product_modifier_groups(product_id,group_id) VALUES($1,$2)',[productId,id]);
 }
 await group('Tipo de moka',1,1,[['Moka',0],['Moka blanco',0]],['5b0a5796-bfb4-494a-82ef-3e33eb3d4771','c851d31f-e1e7-406b-995d-7e1b47e429af']);
 await group('Sabor de smoothie',1,1,[['Fresa',0],['Mango',0],['Horchata',0]],['982db491-5624-4dfd-ac3b-69c75ebf0721']);
 await group('Sabor de yogur',1,1,[['Fresa',0],['Mango',0]],['e648d83d-2de6-4a45-86e2-333c66d2725a']);
 await group('Tipo de té',1,1,[['Verde',0],['Manzanilla',0],['Menta',0]],['a545bffb-b7f4-40e2-b05c-acfa0980eeed']);
 await group('Sabor de tisana',1,1,[['Moras',0],['Fresa y kiwi',0],['Frutal',0]],['b45ed109-299f-4540-be8e-3bd2955d87a8']);
 await group('Salsa de chilaquiles',1,1,[['Verde',0],['Roja',0]],['ce304bbc-6331-49a4-812b-fcac83da1a1c','0913966d-3ed0-495c-91a2-83d19e00b25d']);
 await group('Fruta de la avena',1,1,[['Manzana',0],['Plátano',0]],['ee7a146b-6514-4a35-ad97-12f07741ad0d']);
 await group('Jamón adicional',0,1,[['Jamón',10]],['6c4ac4ce-9121-4b48-9521-debd6b188811']);
 // Se registra el extra confirmado. Su aplicación a bebidas debe configurarla el administrador.
 await group('Preparación latte',0,1,[['Hazlo latte',12]],[]);
 await c.query("UPDATE public.products SET archived=true,available=false WHERE id='fb3c9342-05e8-499a-9160-6f9a30fe30b2'");
 const report={key,corrections,products:(await c.query('SELECT count(*)::int total,count(*) FILTER(WHERE NOT archived)::int active FROM public.products')).rows[0],variants:(await c.query('SELECT count(*)::int count FROM public.product_variants')).rows[0],pending:['Confirmar precios y presentación de licuados.','Confirmar presentación de limonada rosa.','Configurar a qué productos aplica Hazlo latte; confirmar alcance de leche y sabores adicionales antes de publicarlos.','Confirmar si debe agregarse latte helado sin vainilla.']};
 await c.query('UPDATE cafe_access.catalog_backups SET after_data=$1 WHERE key=$2',[JSON.stringify(report),key]);
 await c.query('COMMIT');await fs.writeFile('C:/Users/Axel/Downloads/cafeadmin/catalog-maintenance/normalized-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({key,products:report.products,variants:report.variants,corrections:corrections.length}));
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await c.end();}
