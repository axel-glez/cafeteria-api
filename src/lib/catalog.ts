import { Prisma } from '../generated/prisma/client';
export const catalogInclude = {
 category_details: true,
 variants: { where: { archived: false }, orderBy: { position: 'asc' as const }, include: { presentation: true } },
 modifier_groups: { include: { group: { include: { options: { orderBy: { name: 'asc' as const } } } } } },
};
type CatalogProduct=Prisma.productsGetPayload<{include:typeof catalogInclude}>;
// Los campos category y price se calculan para mantener compatible el panel existente.
export function serializeProduct(product:CatalogProduct) {
 const {category_details,variants,modifier_groups,...fields}=product;
 return {...fields,category:category_details.name,
  price:variants.length?variants.reduce((min,v)=>v.price.lessThan(min)?v.price:min,variants[0]!.price).toFixed(2):null,
  variants:variants.map(({presentation,...v})=>({...v,label:presentation.label,volume_ml:presentation.volume_ml,price:v.price.toFixed(2)})),
  modifier_groups:modifier_groups.map(({group})=>({...group,options:group.options.map(o=>({...o,price:o.price.toFixed(2)}))})),
 };
}
export class ApiError extends Error {constructor(public status:number,message:string,public code?:string){super(message);}}

