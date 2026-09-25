import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { priceSchema } from './products.js';
import { ApiError } from '../lib/catalog.js';
import { requireAdmin } from './auth.js';
export const modifiersRouter=Router();
const option=z.strictObject({id:z.uuid().optional(),name:z.string().trim().min(1).max(80),price:priceSchema,available:z.boolean().default(true)});
const body=z.strictObject({name:z.string().trim().min(1).max(80),min_selections:z.number().int().min(0).max(12),max_selections:z.number().int().min(1).max(12),options:z.array(option).min(1).max(30)})
 .refine(d=>d.min_selections<=d.max_selections,'El mínimo no puede superar el máximo')
 .refine(d=>d.options.filter(o=>o.available).length>=d.min_selections,'Faltan opciones disponibles para cumplir el mínimo')
 .refine(d=>new Set(d.options.map(o=>o.name.toLowerCase())).size===d.options.length,'No repitas nombres de opciones')
 .refine(d=>{const ids=d.options.flatMap(o=>o.id?[o.id]:[]);return ids.length===new Set(ids).size;},'No repitas identificadores');
modifiersRouter.get('/',async(_req,res)=>res.json(await prisma.modifier_groups.findMany({include:{options:{orderBy:{name:'asc'}}},orderBy:{name:'asc'}})));
modifiersRouter.post('/',requireAdmin,async(req,res)=>{
 const {options,...data}=body.parse(req.body);if(options.some(o=>o.id))throw new ApiError(400,'Las opciones nuevas no llevan identificador');
 res.status(201).json(await prisma.modifier_groups.create({data:{...data,options:{create:options}},include:{options:true}}));
});
modifiersRouter.put('/:id',requireAdmin,async(req,res)=>{
 const id=z.uuid().parse(req.params.id);const {options,...data}=body.parse(req.body);
 res.json(await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM public.modifier_groups WHERE id=${id}::uuid FOR UPDATE`;
  const current=await tx.modifier_groups.findUniqueOrThrow({where:{id},include:{options:true}});
  if(options.some(o=>o.id&&!current.options.some(c=>c.id===o.id)))throw new ApiError(400,'Una opción no pertenece a este grupo');
  // Las opciones compradas conservan su identificador y permanecen en el historial.
  await tx.modifier_options.updateMany({where:{group_id:id},data:{available:false}});
  for(const {id:optionId,...value} of options){if(optionId)await tx.modifier_options.update({where:{id:optionId},data:value});else await tx.modifier_options.create({data:{...value,group_id:id}});}
  return tx.modifier_groups.update({where:{id},data,include:{options:true}});
 },{timeout:20000}));
});
