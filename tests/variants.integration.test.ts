import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { accessDb } from '../src/lib/access';
import { adminFixture } from './auth-fixture';
test('Presentaciones: precios, atomicidad, permisos y compatibilidad', {timeout:60000}, async()=>{
 const auth=await adminFixture();const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 const req=(method:string,path:string,body?:unknown)=>fetch(base+path,{method,headers:auth.headers,body:body===undefined?undefined:JSON.stringify(body)});
 let id:string|undefined,categoryId:string|undefined;
 try {
  const category=await prisma.categories.create({data:{name:'Tamaños test '+randomUUID()}});categoryId=category.id;
  const response=await req('POST','/productos',{name:'Bebida test',description:'Registro temporal',price:999,image:'assets/galleta.jpg',category:category.name,variants:[{label:'M',volume_ml:350,price:35},{label:'G',volume_ml:470,price:40.50}]});
  assert.equal(response.status,201);const created=await response.json();id=created.id;assert.equal(Number(created.price),35);assert.equal(created.variants.length,2);
  const mediumId=created.variants[0].id;
  assert.equal((await req('POST','/productos',{name:'BEBIDA TEST',description:'Duplicado',price:1,image:'assets/galleta.jpg',category:category.name})).status,409);
  await prisma.products.update({where:{id},data:{archived:true}});
  assert.equal((await (await req('GET','/productos?category='+encodeURIComponent(category.name))).json()).length,0);
  assert.equal((await (await req('GET','/categorias/'+category.id+'/productos')).json()).length,0);
  await prisma.products.update({where:{id},data:{archived:false}});
  assert.equal((await req('PATCH','/productos/'+id,{price:20})).status,400);
  assert.equal((await req('PATCH','/productos/'+id,{variants:[{label:'M',price:1},{label:'m',price:2}]})).status,400);
  assert.equal((await req('PATCH','/productos/'+id,{variants:[]})).status,400);
  assert.equal((await req('PATCH','/productos/'+id,{variants:[{label:'M',volume_ml:-1,price:1}]})).status,400);
  assert.equal((await req('PATCH','/productos/'+id,{variants:[{label:'M',price:1.001}]})).status,400);
  const update=await req('PATCH','/productos/'+id,{variants:[{label:'M',price:38},{label:'+G',price:49}]});assert.equal(update.status,200);
  const updated=await update.json();assert.equal(updated.variants[0].id,mediumId);assert.equal(Number(updated.price),38);assert.deepEqual(updated.variants.map((v:any)=>v.label),['M','+G']);
  const viaCategory=await req('GET','/categorias/'+category.id+'/productos');assert.equal((await viaCategory.json())[0].variants.length,2);
  const cookie=auth.headers.Cookie.split('=')[1];
  await accessDb.query("UPDATE cafe_access.accounts SET role='employee' WHERE id=(SELECT account_id FROM cafe_access.sessions WHERE token_hash=encode(sha256($1::bytea),'hex'))",[cookie]);
  assert.equal((await req('PATCH','/productos/'+id,{variants:[{label:'M',price:1}]})).status,403);
  assert.equal((await req('PATCH','/productos/'+id,{available:false})).status,200);
  const unchanged=await req('GET','/productos/'+id);assert.equal(Number((await unchanged.json()).price),38);
  await prisma.products.delete({where:{id}});id=undefined;assert.equal(await prisma.product_variants.count({where:{product_id:created.id}}),0);
 } finally { if(id)await prisma.products.delete({where:{id}});if(categoryId)await prisma.categories.delete({where:{id:categoryId}});server.close();await prisma.$disconnect();await auth.cleanup(); }
});
