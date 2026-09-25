import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { catalogInclude, serializeProduct, ApiError } from '../lib/catalog.js';
import { emitCatalogUpdated } from '../lib/socket.js';
const uuid=z.uuid();
const text=z.string().trim().min(1,'Este campo no puede estar vacío');
export const priceSchema=z.number().min(0).max(99999999.99).refine(v=>/^\d+(\.\d{1,2})?$/.test(String(v)),'El precio debe tener como máximo dos decimales');
const variantSchema=z.strictObject({id:uuid.optional(),label:text.max(30),volume_ml:z.number().int().min(1).max(10000).nullable().optional(),price:priceSchema,available:z.boolean().optional()});
const variantsSchema=z.array(variantSchema).min(1).max(12).refine(items=>new Set(items.map(v=>v.label.toLowerCase())).size===items.length,'No repitas el nombre de una presentación').refine(items=>{const ids=items.flatMap(v=>v.id?[v.id]:[]);return ids.length===new Set(ids).size;},'No repitas el identificador de una presentación');
const fields=z.strictObject({name:text.max(150),description:text.max(1500),image:text.max(2000),category:text.optional(),category_id:uuid.optional(),price:priceSchema.optional(),available:z.boolean(),variants:variantsSchema.optional(),modifier_group_ids:z.array(uuid).max(12).refine(a=>a.length===new Set(a).size).optional()});
const create=fields.extend({available:z.boolean().default(true)}).refine(d=>Boolean(d.category||d.category_id),'Selecciona una categoría').refine(d=>Boolean(d.variants||d.price!==undefined),'Indica los precios de las presentaciones');
const patch=fields.partial().refine(d=>Object.keys(d).length>0,'Envía al menos un campo para actualizar');
export const productsRouter=Router();
productsRouter.get('/',async(req,res)=>{
 const q=z.object({category:text.optional(),category_id:uuid.optional()}).parse(req.query);
 const rows=await prisma.products.findMany({where:{archived:false,...(q.category?{category_details:{name:q.category}}:{}),...(q.category_id?{category_id:q.category_id}:{})},include:catalogInclude,orderBy:[{created_at:'desc'},{id:'asc'}]});res.json(rows.map(serializeProduct));
});
productsRouter.get('/:id',async(req,res)=>res.json(serializeProduct(await prisma.products.findFirstOrThrow({where:{id:uuid.parse(req.params.id),archived:false},include:catalogInclude}))));
productsRouter.post('/',async(req,res)=>{const p=await save(undefined,create.parse(req.body));emitCatalogUpdated();res.location('/productos/'+p.id).status(201).json(p);});
productsRouter.put('/:id',async(req,res)=>{const p=await save(uuid.parse(req.params.id),create.parse(req.body));emitCatalogUpdated();res.json(p);});
productsRouter.patch('/:id',async(req,res)=>{const p=await save(uuid.parse(req.params.id),patch.parse(req.body));emitCatalogUpdated();res.json(p);});
productsRouter.delete('/:id',async(req,res)=>{
 const id=uuid.parse(req.params.id);
 await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.products WHERE id=${id}::uuid FOR UPDATE`;await tx.products.findFirstOrThrow({where:{id,archived:false}});await tx.products.update({where:{id},data:{archived:true,available:false}});});emitCatalogUpdated();res.status(204).end();
});
productsRouter.patch('/:id/variantes/:variantId',async(req,res)=>{
 const id=uuid.parse(req.params.id),variantId=uuid.parse(req.params.variantId);
 const data=z.strictObject({available:z.boolean()}).parse(req.body);
 await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.products WHERE id=${id}::uuid FOR UPDATE`;await tx.products.findFirstOrThrow({where:{id,archived:false}});await tx.product_variants.findFirstOrThrow({where:{id:variantId,product_id:id,archived:false}});await tx.product_variants.update({where:{id:variantId},data});});
 const product=serializeProduct(await prisma.products.findUniqueOrThrow({where:{id},include:catalogInclude}));emitCatalogUpdated();res.json(product);
});
async function save(id:string|undefined,data:z.infer<typeof patch>){
 return prisma.$transaction(async tx=>{
  if(id)await tx.$queryRaw`SELECT id FROM public.products WHERE id=${id}::uuid FOR UPDATE`;
  const current=id?await tx.products.findFirstOrThrow({where:{id,archived:false},include:catalogInclude}):null;
  const {category,category_id,price,variants,modifier_group_ids,...rest}=data;
  let categoryId=category_id||current?.category_id;
  if(category||category_id){const c=await tx.categories.findFirst({where:{...(category?{name:category}:{}),...(category_id?{id:category_id}:{})}});if(!c)throw new ApiError(409,'La categoría indicada no existe o no coincide');categoryId=c.id;}
  if(!variants&&price!==undefined&&current&&current.variants.length>1)throw new ApiError(400,'Edita los precios por tamaño de este producto');
  const sizes=variants||(price!==undefined?[{id:current?.variants[0]?.id,label:current?.variants[0]?.presentation.label||'Único',volume_ml:current?.variants[0]?.presentation.volume_ml,price}]:undefined);
  const p=current?await tx.products.update({where:{id},data:{...rest,category_id:categoryId}}):await tx.products.create({data:{name:data.name!,description:data.description!,image:data.image!,category_id:categoryId!,available:data.available??true}});
  if(sizes){
   // Archivar primero permite cambiar o intercambiar presentaciones sin perder sus IDs.
   await tx.product_variants.updateMany({where:{product_id:p.id,archived:false},data:{archived:true}});
   for(const [position,size] of sizes.entries()){
    const matching=size.id?current?.variants.find(v=>v.id===size.id):current?.variants.find(v=>v.presentation.label.toLowerCase()===size.label.toLowerCase());
    if(size.id&&!matching)throw new ApiError(400,'La presentación no pertenece a este producto');
    const fixed:Record<string,number>={M:350,G:470,'+G':590};
    const label=size.label.trim();const standard=fixed[label.toUpperCase()];
    if(standard&&size.volume_ml!=null&&size.volume_ml!==standard)throw new ApiError(400,`${label}: el volumen debe ser ${standard} ml`);
    const volume=size.volume_ml??standard??null;
    const key=label.toLowerCase()+':'+(volume??'');
    const presentation=await tx.presentations.upsert({where:{key},create:{key,label:standard?label.toUpperCase():label,volume_ml:volume},update:{}});
    const v={presentation_id:presentation.id,price:size.price,position,available:size.available??matching?.available??true,archived:false};
    if(matching)await tx.product_variants.update({where:{id:matching.id},data:v});else await tx.product_variants.create({data:{...v,product_id:p.id}});
   }
  }
  if(modifier_group_ids){
   if(await tx.modifier_groups.count({where:{id:{in:modifier_group_ids}}})!==modifier_group_ids.length)throw new ApiError(400,'Hay un grupo de opciones inexistente');
   await tx.product_modifier_groups.deleteMany({where:{product_id:p.id}});
   await tx.product_modifier_groups.createMany({data:modifier_group_ids.map(group_id=>({product_id:p.id,group_id}))});
  }
  return serializeProduct(await tx.products.findUniqueOrThrow({where:{id:p.id},include:catalogInclude}));
 },{timeout:20000});
}
