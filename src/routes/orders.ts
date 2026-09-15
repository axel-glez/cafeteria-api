import { Router, type RequestHandler } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { accessDb, tokenHash } from '../lib/access';
import { prisma } from '../lib/prisma';
import { ApiError,catalogInclude,serializeProduct } from '../lib/catalog';
export const mobileRouter=Router();
export const ordersRouter=Router();
const uuid=z.uuid();
const statuses=z.enum(['new','preparing','ready','delivered','cancelled']);
const bodySchema=z.strictObject({items:z.array(z.strictObject({variant_id:uuid,quantity:z.number().int().min(1).max(3),option_ids:z.array(uuid).max(12).default([]).refine(a=>new Set(a).size===a.length,'No repitas una opción')})).min(1).max(9)});
const money=(cents:number)=>(cents/100).toFixed(2);
async function transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await accessDb.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function limit(bucket:string,max:number){
 const r=await accessDb.query(`INSERT INTO cafe_access.login_limits(bucket,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN cafe_access.login_limits.expires_at<=now() THEN 1 ELSE cafe_access.login_limits.attempts+1 END,expires_at=CASE WHEN cafe_access.login_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE cafe_access.login_limits.expires_at END RETURNING attempts`,[bucket]);
 if(r.rows[0].attempts>max)throw new ApiError(429,'Demasiadas solicitudes. Espera un minuto');
}
const requireCustomer:RequestHandler=async(req,res,next)=>{
 const match=/^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization')||'');
 if(!match)throw new ApiError(401,'Se requiere una sesión de compra');
 const hash=tokenHash(match[1]!);
 if(!(await accessDb.query('SELECT 1 FROM public.order_sessions WHERE token_hash=$1 AND expires_at>now()',[hash])).rowCount)throw new ApiError(401,'La sesión de compra terminó');
 res.locals.customerHash=hash;next();
};
mobileRouter.get('/catalogo',async(_req,res)=>{
 const rows=await prisma.products.findMany({where:{archived:false,available:true,variants:{some:{archived:false,available:true}}},include:{...catalogInclude,variants:{...catalogInclude.variants,where:{archived:false,available:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
 res.json({currency:'MXN',products:rows.map(p=>{const data=serializeProduct(p);return {...data,modifier_groups:data.modifier_groups.map(g=>({...g,options:g.options.filter(o=>o.available)}))};})});
});
mobileRouter.post('/sesiones',async(req,res)=>{
 z.strictObject({}).parse(req.body);await limit('mobile:sessions:global',60);
 const token=randomBytes(32).toString('hex');
 const result=await accessDb.query("INSERT INTO public.order_sessions(token_hash,expires_at) VALUES($1,now()+interval '7 days') RETURNING expires_at",[tokenHash(token)]);
 res.status(201).json({token,expires_at:result.rows[0].expires_at});
});
const orderColumns='id,folio::text,status,currency,total::text,created_at,updated_at';
async function readOrders(c:PoolClient,ids:string[]){
 if(!ids.length)return [];
 const orders=(await c.query(`SELECT ${orderColumns} FROM public.orders WHERE id=ANY($1::uuid[]) ORDER BY created_at DESC,id DESC`,[ids])).rows;
 const items=(await c.query(`SELECT id,order_id,variant_id,product_name,presentation_label,volume_ml,quantity,base_price::text,unit_price::text,line_total::text FROM public.order_items WHERE order_id=ANY($1::uuid[]) ORDER BY position`,[ids])).rows;
 const options=(await c.query('SELECT o.item_id,o.option_id,o.group_name,o.option_name,o.price::text FROM public.order_item_options o JOIN public.order_items i ON i.id=o.item_id WHERE i.order_id=ANY($1::uuid[]) ORDER BY o.group_name,o.option_name',[ids])).rows;
 return orders.map(order=>({...order,folio:'B-'+order.folio,items:items.filter(i=>i.order_id===order.id).map(({order_id,...i})=>({...i,options:options.filter(o=>o.item_id===i.id).map(({item_id,...o})=>o)}))}));
}
async function readOrder(c:PoolClient,id:string){
 const order=(await readOrders(c,[id]))[0];if(!order)throw new ApiError(404,'Pedido no encontrado');return order;
}
mobileRouter.post('/pedidos',requireCustomer,async(req,res)=>{
 const body=bodySchema.parse(req.body),key=uuid.parse(req.get('Idempotency-Key'));
 const normalized={items:body.items.map(i=>({...i,option_ids:[...i.option_ids].sort()}))};
 const requestHash=tokenHash(JSON.stringify(normalized));
 // Contadores fuera de la transacción: no se revierten al rechazar un pedido ni agotan el pool.
 await limit('mobile:orders:global',120);await limit('mobile:orders:'+res.locals.customerHash,10);
 const result=await transaction(async c=>{
  // Una sesión serializa los reintentos concurrentes; la restricción UNIQUE es una segunda defensa.
  await c.query('SELECT token_hash FROM public.order_sessions WHERE token_hash=$1 FOR UPDATE',[res.locals.customerHash]);
  const previous=(await c.query('SELECT id,request_hash FROM public.orders WHERE session_hash=$1 AND idempotency_key=$2',[res.locals.customerHash,key])).rows[0];
  if(previous){if(previous.request_hash!==requestHash)throw new ApiError(409,'Esa clave ya se usó con otro pedido');return {replayed:true,order:await readOrder(c,previous.id)};}
  const ids=[...new Set(body.items.map(i=>i.variant_id))].sort();
  const variants=(await c.query(`SELECT v.id,v.product_id,(v.price*100)::bigint::text cents,p.name,s.label,s.volume_ml
   FROM public.product_variants v JOIN public.products p ON p.id=v.product_id JOIN public.presentations s ON s.id=v.presentation_id
   WHERE v.id=ANY($1::uuid[]) AND NOT v.archived AND v.available AND NOT p.archived AND p.available ORDER BY p.id,v.id FOR SHARE OF p,v,s`,[ids])).rows;
  if(variants.length!==ids.length)throw new ApiError(409,'Una presentación ya no está disponible. Actualiza el catálogo','ORDER_REJECTED');
  const productIds=[...new Set(variants.map(v=>v.product_id))].sort();
  if(productIds.length>3)throw new ApiError(400,'Puedes pedir hasta 3 productos distintos');
  const quantities=new Map<string,number>();
  for(const item of body.items){const productId=variants.find(v=>v.id===item.variant_id)!.product_id;quantities.set(productId,(quantities.get(productId)||0)+item.quantity);}
  if([...quantities.values()].some(quantity=>quantity>3))throw new ApiError(400,'Puedes pedir hasta 3 unidades por producto, sumando tamaños y opciones');
  const groups=(await c.query(`SELECT pg.product_id,g.* FROM public.product_modifier_groups pg JOIN public.modifier_groups g ON g.id=pg.group_id WHERE pg.product_id=ANY($1::uuid[]) ORDER BY g.id FOR SHARE OF g`,[productIds])).rows;
  const optionIds=[...new Set(body.items.flatMap(i=>i.option_ids))].sort();
  const options=(await c.query('SELECT id,group_id,name,(price*100)::bigint::text cents FROM public.modifier_options WHERE id=ANY($1::uuid[]) AND available ORDER BY id FOR SHARE',[optionIds])).rows;
  if(options.length!==optionIds.length)throw new ApiError(409,'Una opción ya no está disponible','ORDER_REJECTED');
  let total=0;
  const lines=body.items.map((item,position)=>{
   const variant=variants.find(v=>v.id===item.variant_id)!;
   const applicable=groups.filter(g=>g.product_id===variant.product_id);
   const selected=item.option_ids.map(id=>options.find(o=>o.id===id)!);
   if(selected.some(o=>!applicable.some(g=>g.id===o.group_id)))throw new ApiError(400,'Una opción no corresponde a este producto');
   for(const g of applicable){const n=selected.filter(o=>o.group_id===g.id).length;if(n<g.min_selections||n>g.max_selections)throw new ApiError(400,`${variant.name}: selecciona entre ${g.min_selections} y ${g.max_selections} opciones de ${g.name}`);}
   const unit=Number(variant.cents)+selected.reduce((n,o)=>n+Number(o.cents),0);
   const subtotal=unit*item.quantity;total+=subtotal;
   if(unit>9999999999||total>999999999999)throw new ApiError(400,'El importe supera el máximo permitido');
   return {item,position,variant,selected,applicable,unit,subtotal};
  });
  const order=(await c.query('INSERT INTO public.orders(session_hash,idempotency_key,request_hash,total) VALUES($1,$2,$3,$4) RETURNING id',[res.locals.customerHash,key,requestHash,money(total)])).rows[0];
  // Insertar por lotes evita una ida a la base por cada complemento del carrito.
  const purchased=lines.map(l=>({id:randomUUID(),order_id:order.id,variant_id:l.variant.id,product_name:l.variant.name,presentation_label:l.variant.label,volume_ml:l.variant.volume_ml,quantity:l.item.quantity,base_price:money(Number(l.variant.cents)),unit_price:money(l.unit),line_total:money(l.subtotal),position:l.position}));
  await c.query(`INSERT INTO public.order_items(id,order_id,variant_id,product_name,presentation_label,volume_ml,quantity,base_price,unit_price,line_total,position) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,order_id uuid,variant_id uuid,product_name text,presentation_label text,volume_ml integer,quantity integer,base_price numeric,unit_price numeric,line_total numeric,position integer)`,[JSON.stringify(purchased)]);
  const purchasedOptions=lines.flatMap((l,i)=>l.selected.map(o=>({item_id:purchased[i]!.id,option_id:o.id,group_name:l.applicable.find(g=>g.id===o.group_id)!.name,option_name:o.name,price:money(Number(o.cents))})));
  if(purchasedOptions.length)await c.query(`INSERT INTO public.order_item_options(item_id,option_id,group_name,option_name,price) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(item_id uuid,option_id uuid,group_name text,option_name text,price numeric)`,[JSON.stringify(purchasedOptions)]);
  await c.query("INSERT INTO public.order_status_history(order_id,to_status) VALUES($1,'new')",[order.id]);
  return {replayed:false,order:await readOrder(c,order.id)};
 });
 res.set('Idempotency-Replayed',String(result.replayed)).location('/api/v1/pedidos/'+result.order.id).status(result.replayed?200:201).json(result.order);
});
mobileRouter.get('/pedidos/:id',requireCustomer,async(req,res)=>{
 const id=uuid.parse(req.params.id);
 const order=await transaction(async c=>{if(!(await c.query('SELECT 1 FROM public.orders WHERE id=$1 AND session_hash=$2',[id,res.locals.customerHash])).rowCount)throw new ApiError(404,'Pedido no encontrado');return readOrder(c,id);});res.json(order);
});
ordersRouter.get('/',async(req,res)=>{
 const query=z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(100).default(100),status:statuses.optional(),scope:z.enum(['active']).optional()}).parse(req.query);
 const result=await transaction(async c=>{
  const rows=(await c.query(`SELECT id FROM public.orders WHERE ($1::text IS NULL OR status=$1) AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM public.orders WHERE id=$2)) AND ($4::boolean=false OR status IN ('new','preparing','ready')) ORDER BY created_at DESC,id DESC LIMIT $3`,[query.status??null,query.cursor??null,query.limit+1,query.scope==='active'])).rows;
  const more=rows.length>query.limit;const page=rows.slice(0,query.limit);
  const orders=await readOrders(c,page.map(row=>row.id));
  return {orders,next_cursor:more?page.at(-1)!.id:null};
 });res.json(result);
});
ordersRouter.get('/:id',async(req,res)=>{const id=uuid.parse(req.params.id);res.json(await transaction(async c=>({...await readOrder(c,id),history:(await c.query('SELECT from_status,to_status,actor_account_id,created_at FROM public.order_status_history WHERE order_id=$1 ORDER BY created_at,id',[id])).rows})));});
ordersRouter.patch('/:id/estado',async(req,res)=>{
 const id=uuid.parse(req.params.id);const data=z.strictObject({from_status:statuses,status:statuses}).parse(req.body);
 const next:Record<string,string[]>={new:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['delivered'],delivered:[],cancelled:[]};
 res.json(await transaction(async c=>{
  const current=(await c.query('SELECT status FROM public.orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!current)throw new ApiError(404,'Pedido no encontrado');
  if(current.status!==data.from_status)throw new ApiError(409,'El pedido cambió. Actualiza el tablero');
  if(!next[current.status]!.includes(data.status))throw new ApiError(409,'Ese cambio de estado no está permitido');
  await c.query('UPDATE public.orders SET status=$1,updated_at=now() WHERE id=$2',[data.status,id]);
  await c.query('INSERT INTO public.order_status_history(order_id,from_status,to_status,actor_account_id) VALUES($1,$2,$3,$4)',[id,current.status,data.status,res.locals.account.id]);
  return readOrder(c,id);
 }));
});

