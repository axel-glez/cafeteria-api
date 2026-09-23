import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { accessDb,tokenHash } from '../src/lib/access';
import { adminFixture } from './auth-fixture';
test('Pedidos: opciones, importes, reintentos, permisos, historial y archivo',{timeout:120000},async()=>{
 const auth=await adminFixture();const server=app.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 const hashes:string[]=[],productIds:string[]=[],groupIds:string[]=[];let categoryId:string|undefined;
 const request=(method:string,path:string,body?:unknown,headers:Record<string,string>=auth.headers)=>fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 async function json(method:string,path:string,body:unknown,status=200,headers=auth.headers){const r=await request(method,path,body,headers);const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
 try {
  const category=await prisma.categories.create({data:{name:'Integración pedidos '+randomUUID()}});categoryId=category.id;
  const group=await json('POST','/modificadores',{name:'Sabor prueba '+randomUUID(),min_selections:1,max_selections:1,options:[{name:'Vainilla',price:12.35},{name:'Chocolate',price:0}]},201);groupIds.push(group.id);
  const p=await json('POST','/productos',{name:'Latte temporal '+randomUUID(),description:'Solo pruebas',image:'assets/product-placeholder.svg',category_id:category.id,variants:[{label:'M',price:37.15},{label:'G',price:40}],modifier_group_ids:[group.id]},201);productIds.push(p.id);
  assert.equal(p.variants[0].volume_ml,350);assert.equal(p.category_id,category.id);assert.equal(p.price,'37.15');
  const v=p.variants[0];
  assert.equal((await request('PATCH','/productos/'+p.id,{variants:[{id:v.id,label:'M',volume_ml:400,price:37.15}]})).status,400);
  for(let i=0;i<2;i++){const session=await json('POST','/api/v1/sesiones',{},201,{'Content-Type':'application/json','X-Cafe-Request':'1'});hashes.push(tokenHash(session.token));if(i===0)(p as any).token=session.token;else (p as any).otherToken=session.token;}
  const customer={'Content-Type':'application/json','X-Cafe-Request':'1',Authorization:'Bearer '+p.token,'Idempotency-Key':randomUUID()};
  const draft={items:[{variant_id:v.id,quantity:2,option_ids:[group.options.find((o:any)=>o.name==='Vainilla').id]}]};
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:1}]},customer)).status,400);
  assert.equal((await request('POST','/api/v1/pedidos',{...draft,total:1},customer)).status,400);
  assert.equal((await request('POST','/api/v1/pedidos',{...draft,email:'real@example.com'},customer)).status,400);
  const parallel=await Promise.all([request('POST','/api/v1/pedidos',draft,customer),request('POST','/api/v1/pedidos',draft,customer)]);
  assert.deepEqual(parallel.map(r=>r.status).sort(),[200,201]);const a=await parallel[0]!.json(),b=await parallel[1]!.json();assert.equal(a.id,b.id);assert.equal(a.total,'99.00');assert.equal(a.items[0].unit_price,'49.50');
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{...draft.items[0],quantity:3}]},customer)).status,409);
  assert.equal((await request('GET','/api/v1/pedidos/'+a.id,undefined,{...customer,Authorization:'Bearer '+p.otherToken})).status,404);
  assert.equal((await request('GET','/api/v1/pedidos/'+a.id,undefined,{'X-Cafe-Request':'1'})).status,401);
  assert.equal((await request('GET','/pedidos',undefined,customer)).status,401);
  const foreign=await json('POST','/modificadores',{name:'Ajeno '+randomUUID(),min_selections:0,max_selections:1,options:[{name:'Ajeno',price:1}]},201);groupIds.push(foreign.id);
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:1,option_ids:[foreign.options[0].id]}]},{...customer,'Idempotency-Key':randomUUID()})).status,400);
  const chocolate=group.options.find((o:any)=>o.name==='Chocolate').id;
  const mixed=await json('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:1,option_ids:draft.items[0].option_ids},{variant_id:p.variants[1].id,quantity:1,option_ids:[chocolate]}]},201,{...customer,'Idempotency-Key':randomUUID()});assert.equal(mixed.total,'89.50');assert.equal(mixed.items.length,2);
  assert.equal((await request('PATCH','/api/v1/pedidos/'+mixed.id+'/cancelacion',{}, {...customer,Authorization:'Bearer '+p.otherToken})).status,404);
  const cancelled=await json('PATCH','/api/v1/pedidos/'+mixed.id+'/cancelacion',{},200,customer);assert.equal(cancelled.status,'cancelled');
  assert.equal((await request('PATCH','/api/v1/pedidos/'+mixed.id+'/cancelacion',{},customer)).status,409);
  const bulk=await json('POST','/api/v1/pedidos',{items:Array.from({length:3},()=>({variant_id:p.variants[1].id,quantity:1,option_ids:[chocolate]}))},201,{...customer,'Idempotency-Key':randomUUID()});assert.equal(bulk.total,'120.00');assert.equal(bulk.items.length,3);
  const limitsCustomer={...customer,Authorization:'Bearer '+p.otherToken,'Idempotency-Key':randomUUID()};
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:2,option_ids:[chocolate]},{variant_id:p.variants[1].id,quantity:2,option_ids:[chocolate]}]},limitsCustomer)).status,400);
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:2,option_ids:[chocolate]},{variant_id:v.id,quantity:2,option_ids:draft.items[0].option_ids}]},limitsCustomer)).status,400);
  assert.equal((await request('POST','/api/v1/pedidos',{items:[{variant_id:v.id,quantity:4,option_ids:[chocolate]}]},limitsCustomer)).status,400);
  const extraVariants:string[]=[];
  for(let i=0;i<3;i++){const extra=await json('POST','/productos',{name:'Límite temporal '+randomUUID(),description:'Solo pruebas',image:'assets/product-placeholder.svg',category_id:category.id,variants:[{label:'Único',price:1}]},201);productIds.push(extra.id);extraVariants.push(extra.variants[0].id);}
  const four={items:[...extraVariants.map(variant_id=>({variant_id,quantity:1,option_ids:[]})),{variant_id:v.id,quantity:1,option_ids:[chocolate]}]};
  assert.equal((await request('POST','/api/v1/pedidos',four,limitsCustomer)).status,400);
  const maximum=await json('POST','/api/v1/pedidos',{items:extraVariants.map(variant_id=>({variant_id,quantity:3,option_ids:[]}))},201,limitsCustomer);assert.equal(maximum.total,'9.00');
  const page=await json('GET','/pedidos?limit=1',undefined);assert.equal(page.orders.length,1);assert.ok(page.next_cursor);const page2=await json('GET','/pedidos?limit=1&cursor='+page.next_cursor,undefined);assert.notEqual(page.orders[0].id,page2.orders[0].id);
  const rename=await json('PATCH','/productos/'+p.id,{name:'Nombre actualizado '+randomUUID(),variants:[{id:v.id,label:'Mediano de prueba',volume_ml:350,price:80},{id:p.variants[1].id,label:'G',price:40}]});assert.equal(rename.variants[0].id,v.id);
  await json('PUT','/modificadores/'+group.id,{name:group.name+' editado',min_selections:1,max_selections:1,options:group.options.map((o:any)=>({id:o.id,name:o.name+' editado',price:20,available:true}))});
  const history=await json('GET','/api/v1/pedidos/'+a.id,undefined,200,customer);assert.equal(history.total,'99.00');assert.equal(history.items[0].product_name,p.name);assert.equal(history.items[0].presentation_label,'M');assert.equal(history.items[0].options[0].option_name,'Vainilla');
  await accessDb.query("UPDATE cafe_access.accounts SET role='employee' WHERE id=(SELECT account_id FROM cafe_access.sessions WHERE token_hash=$1)",[tokenHash(auth.headers.Cookie.split('=')[1]!)]);
  assert.equal((await request('PATCH','/productos/'+p.id,{price:1})).status,403);
  assert.equal((await request('DELETE','/productos/'+p.id)).status,403);
  assert.equal((await request('POST','/modificadores',{name:'No permitido'})).status,403);
  await json('PATCH','/productos/'+p.id+'/variantes/'+v.id,{available:false});
  const catalogWithExhaustedVariant=await json('GET','/api/v1/catalogo',undefined);
  const visibleProduct=catalogWithExhaustedVariant.products.find((item:any)=>item.id===p.id);
  assert.ok(visibleProduct);assert.equal(visibleProduct.variants.find((item:any)=>item.id===v.id).available,false);
  await json('PATCH','/productos/'+p.id,{available:false});
  const catalogWithExhaustedProduct=await json('GET','/api/v1/catalogo',undefined);
  assert.equal(catalogWithExhaustedProduct.products.find((item:any)=>item.id===p.id).available,false);
  assert.equal((await request('POST','/api/v1/pedidos',draft,{...customer,'Idempotency-Key':randomUUID()})).status,409);
  assert.equal((await request('PATCH','/pedidos/'+a.id+'/estado',{from_status:'new',status:'delivered'})).status,409);
  await json('PATCH','/pedidos/'+a.id+'/estado',{from_status:'new',status:'preparing'});
  assert.equal((await request('PATCH','/api/v1/pedidos/'+a.id+'/cancelacion',{},customer)).status,409);
  assert.equal((await request('PATCH','/pedidos/'+a.id+'/estado',{from_status:'new',status:'preparing'})).status,409);
  await json('PATCH','/pedidos/'+a.id+'/estado',{from_status:'preparing',status:'ready'});
  await json('PATCH','/pedidos/'+a.id+'/estado',{from_status:'ready',status:'delivered'});
  assert.equal((await json('GET','/pedidos/'+a.id,undefined)).history.length,4);
  await accessDb.query("UPDATE cafe_access.accounts SET role='admin' WHERE id=(SELECT account_id FROM cafe_access.sessions WHERE token_hash=$1)",[tokenHash(auth.headers.Cookie.split('=')[1]!)]);
  assert.equal((await request('DELETE','/productos/'+p.id)).status,204);
  assert.equal((await request('GET','/productos/'+p.id)).status,404);
  assert.ok(!(await json('GET','/api/v1/catalogo',undefined)).products.some((i:any)=>i.id===p.id));
  assert.equal((await json('POST','/api/v1/pedidos',draft,200,customer)).id,a.id);
  assert.equal((await json('GET','/api/v1/pedidos/'+a.id,undefined,200,customer)).total,'99.00');
  await assert.rejects(()=>prisma.products.delete({where:{id:p.id}}));
  const columns=(await accessDb.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='products'")).rows.map(r=>r.column_name);assert.ok(!columns.includes('price'));assert.ok(!columns.includes('category'));
 } finally {
  // Solo filas temporales pertenecientes a las sesiones y UUID creados por esta prueba.
  await accessDb.query('DELETE FROM public.order_item_options WHERE item_id IN (SELECT i.id FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.session_hash=ANY($1::text[]))',[hashes]);
  await accessDb.query('DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE session_hash=ANY($1::text[]))',[hashes]);
  await accessDb.query('DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE session_hash=ANY($1::text[]))',[hashes]);
  await accessDb.query('DELETE FROM public.orders WHERE session_hash=ANY($1::text[])',[hashes]);
  await accessDb.query('DELETE FROM public.order_sessions WHERE token_hash=ANY($1::text[])',[hashes]);
  await prisma.products.deleteMany({where:{id:{in:productIds}}});await prisma.modifier_options.deleteMany({where:{group_id:{in:groupIds}}});await prisma.modifier_groups.deleteMany({where:{id:{in:groupIds}}});if(categoryId)await prisma.categories.delete({where:{id:categoryId}});
  await accessDb.query('DELETE FROM public.presentations WHERE label=$1 AND NOT EXISTS(SELECT 1 FROM public.product_variants v WHERE v.presentation_id=presentations.id)',['Mediano de prueba']);
  await accessDb.query('DELETE FROM cafe_access.login_limits WHERE bucket=ANY($1::text[])',[hashes.map(h=>'mobile:orders:'+h)]);
  server.close();await prisma.$disconnect();await auth.cleanup();
 }
});

