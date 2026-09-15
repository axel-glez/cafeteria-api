import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { accessDb } from '../src/lib/access';
import { adminFixture } from '../tests/auth-fixture';
const file=new URL('../.visual-app-fixture.json',import.meta.url);const mode=process.argv[2];
const auth=await adminFixture();
async function api(method:string,path:string,body?:unknown){const r=await fetch('http://127.0.0.1:5000'+path,{method,headers:auth.headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('API '+r.status);return r.status===204?null:r.json();}
try{
 if(mode==='create'){
  if(fs.existsSync(file))throw Error('Existing fixture must be cleaned first');
  const category=await prisma.categories.create({data:{name:'Verificación temporal '+randomUUID()}});
  const p=await api('POST','/productos',{name:'Prueba visual (no preparar)',description:'Producto temporal para verificar la conexión. No preparar.',image:'assets/product-placeholder.svg',category_id:category.id,variants:[{label:'M',price:35},{label:'G',price:40},{label:'+G',price:45}]});
  fs.writeFileSync(file,JSON.stringify({productId:p.id,categoryId:category.id}));console.log(JSON.stringify({productId:p.id,name:p.name}));
 }else{
  const fixture=JSON.parse(fs.readFileSync(file,'utf8'));
  const orders=(await accessDb.query('SELECT DISTINCT o.id,o.folio::text,o.total::text,o.status,o.session_hash FROM public.orders o JOIN public.order_items i ON i.order_id=o.id JOIN public.product_variants v ON v.id=i.variant_id WHERE v.product_id=$1',[fixture.productId])).rows;
  if(mode==='deliver'){if(orders.length!==1||orders[0].total!=='110.00')throw Error('Unexpected visual order');let from=orders[0].status;for(const status of ['preparing','ready','delivered']){await api('PATCH','/pedidos/'+orders[0].id+'/estado',{from_status:from,status});from=status;}console.log(JSON.stringify({folio:'B-'+orders[0].folio,total:orders[0].total,status:'delivered'}));}
  if(mode==='cleanup'){
   const ids=orders.map(o=>o.id);await accessDb.query('DELETE FROM public.order_item_options WHERE item_id IN (SELECT id FROM public.order_items WHERE order_id=ANY($1::uuid[]))',[ids]);await accessDb.query('DELETE FROM public.order_items WHERE order_id=ANY($1::uuid[])',[ids]);await accessDb.query('DELETE FROM public.order_status_history WHERE order_id=ANY($1::uuid[])',[ids]);await accessDb.query('DELETE FROM public.orders WHERE id=ANY($1::uuid[])',[ids]);
   await prisma.products.delete({where:{id:fixture.productId}});await prisma.categories.delete({where:{id:fixture.categoryId}});fs.unlinkSync(file);console.log('Temporary visual product and orders cleaned');
  }
 }
}finally{await prisma.$disconnect();await auth.cleanup();}
