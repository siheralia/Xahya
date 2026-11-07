/** System-managed forging and fabrication recipes.
 * No business owner or customer may create item definitions or effect graphs.
 * Recipes point only at catalog items explicitly marked CRAFTED.
 */
export const MANAGED_CRAFT_RECIPES_KEY="managed_craft_recipes_v1";
export const MAX_MANAGED_CRAFT_RECIPES=100;
export const MAX_CRAFT_RECIPES_PER_BUSINESS=12;
export type CraftIngredient={itemId:number;quantity:number};
export type ManagedCraftRecipe={
 id:string;name:string;description:string;active:boolean;
 kind:"FORGE"|"FABRICATE";
 fee:number;outputItemId:number;outputQuantity:number;
 ingredients:CraftIngredient[];
 customerAccess:"PUBLIC"|"OWNER_ONLY";requiresEmployee:boolean;
 businessIds:number[];
};
const positive=(n:unknown,min:number,max:number)=>Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
const keys=["id","name","description","active","kind","fee","outputItemId","outputQuantity",
 "ingredients","customerAccess","requiresEmployee","businessIds"];
export function normalizeManagedCraftRecipe(input:unknown):ManagedCraftRecipe{
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Receta de fabricación inválida.");
 const x=input as Record<string,unknown>;
 if(Object.keys(x).some(k=>!keys.includes(k)))throw new Error("Campos de receta desconocidos.");
 const id=String(x.id??"");
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new Error("Identificador de receta inválido.");
 const name=typeof x.name==="string"?x.name.trim():"";
 const description=typeof x.description==="string"?x.description.trim():"";
 if(!name||name.length>100||description.length>500)
  throw new Error("Nombre o descripción de receta inválidos.");
 if(x.kind!=="FORGE"&&x.kind!=="FABRICATE")
  throw new Error("Tipo de fabricación inválido.");
 if(typeof x.active!=="boolean"||typeof x.requiresEmployee!=="boolean")
  throw new Error("Disponibilidad de receta inválida.");
 if(x.customerAccess!=="PUBLIC"&&x.customerAccess!=="OWNER_ONLY")
  throw new Error("Permiso de clientes inválido.");
 if(!positive(x.fee,0,1_000_000))throw new Error("Tarifa de fabricación inválida.");
 if(!positive(x.outputItemId,1,2_147_483_647)||!positive(x.outputQuantity,1,10))
  throw new Error("Producto fabricado o cantidad inválidos.");
 if(!Array.isArray(x.ingredients)||x.ingredients.length<1||x.ingredients.length>8)
  throw new Error("Cada receta necesita entre uno y ocho materiales.");
 const materialIds=new Set<number>();
 const ingredients:CraftIngredient[]=x.ingredients.map(raw=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
   throw new Error("Ingrediente inválido.");
  const item=raw as Record<string,unknown>;
  if(Object.keys(item).some(k=>k!=="itemId"&&k!=="quantity")||
   !positive(item.itemId,1,2_147_483_647)||!positive(item.quantity,1,100))
   throw new Error("Material o cantidad inválidos.");
  const itemId=item.itemId as number;
  if(materialIds.has(itemId))throw new Error("Material duplicado en la receta.");
  materialIds.add(itemId);
  return {itemId,quantity:item.quantity as number};
 });
 if(!Array.isArray(x.businessIds)||x.businessIds.length>500||
  x.businessIds.some(v=>!positive(v,1,2_147_483_647))||
  new Set(x.businessIds).size!==x.businessIds.length)
  throw new Error("Lista de negocios autorizados inválida.");
 return {id,name,description,active:x.active,kind:x.kind,
  fee:x.fee as number,outputItemId:x.outputItemId as number,
  outputQuantity:x.outputQuantity as number,ingredients,
  customerAccess:x.customerAccess,requiresEmployee:x.requiresEmployee,
  businessIds:[...(x.businessIds as number[])].sort((a,b)=>a-b)};
}
export function readManagedCraftRecipes(value:unknown):ManagedCraftRecipe[]{
 let data:unknown;
 try{data=typeof value==="string"?JSON.parse(value):value;}catch{return [];}
 if(!Array.isArray(data))return [];
 const result:ManagedCraftRecipe[]=[],seen=new Set<string>();
 for(const raw of data){
  try{
   const recipe=normalizeManagedCraftRecipe(raw);
   if(!seen.has(recipe.id)){result.push(recipe);seen.add(recipe.id);}
  }catch{ /* invalid stored recipes fail closed */ }
 }
 return result.slice(0,MAX_MANAGED_CRAFT_RECIPES);
}
export function checkManagedCraftLimits(catalog:readonly ManagedCraftRecipe[]):void{
 if(catalog.length>MAX_MANAGED_CRAFT_RECIPES)
  throw new Error("Máximo 100 recetas en el catálogo.");
 const ids=new Set<string>(),counts=new Map<number,number>();
 for(const raw of catalog){
  const recipe=normalizeManagedCraftRecipe(raw);
  if(ids.has(recipe.id))throw new Error("Recetas duplicadas.");
  ids.add(recipe.id);
  for(const businessId of recipe.businessIds){
   const next=(counts.get(businessId)??0)+1;
   if(next>MAX_CRAFT_RECIPES_PER_BUSINESS)
    throw new Error("Máximo 12 recetas por negocio.");
   counts.set(businessId,next);
  }
 }
}
export function authorizedCraftRecipes(
 recipes:readonly ManagedCraftRecipe[],businessId:number,includeInactive=false
):ManagedCraftRecipe[]{
 if(!positive(businessId,1,2_147_483_647))return [];
 return recipes.filter(r=>r.businessIds.includes(businessId)&&(includeInactive||r.active))
  .slice(0,MAX_CRAFT_RECIPES_PER_BUSINESS);
}
export type CraftMaterialStack={
 id:number;itemId:number;quantity:number;equipped:boolean;
};
/** Deterministic plan, choosing only unequipped stacks belonging to the caller.
 * The API locks/rechecks these exact IDs before making the corresponding debits.
 */
export function allocateCraftMaterials(
 ingredients:readonly CraftIngredient[],stacks:readonly CraftMaterialStack[]
):Array<{characterItemId:number;itemId:number;quantity:number}>{
 const allocations:Array<{characterItemId:number;itemId:number;quantity:number}>=[];
 const used=new Set<number>();
 for(const ingredient of ingredients){
  let missing=ingredient.quantity;
  for(const row of stacks.filter(row=>row.itemId===ingredient.itemId&&!row.equipped)
   .sort((a,b)=>a.id-b.id)){
   if(missing===0)break;
   if(used.has(row.id)||!positive(row.quantity,1,2_147_483_647))continue;
   const quantity=Math.min(missing,row.quantity);
   if(quantity<=0)continue;
   allocations.push({characterItemId:row.id,itemId:ingredient.itemId,quantity});
   used.add(row.id);missing-=quantity;
  }
  if(missing>0)throw new Error("No tienes los materiales necesarios.");
 }
 return allocations;
}
/** Whitelisted output: forge creates equipment, fabrication can create other
 * non-property catalog items. Both require acquisitionType=CRAFTED.
 */
export function validateCraftOutput(recipe:ManagedCraftRecipe,item:{
 id:number;itemType:string;acquisitionType:string;propertyBusinessId?:number|null;
}):void{
 if(item.id!==recipe.outputItemId||item.acquisitionType!=="CRAFTED"||
  item.propertyBusinessId!=null||item.itemType==="PROPERTY")
  throw new Error("El producto debe ser un objeto fabricable del catálogo, sin propiedad exclusiva.");
 const equipment=["WEAPON","ARMOR","ACCESSORY"];
 const other=["MATERIAL","CONSUMABLE","OTHER"];
 if(recipe.kind==="FORGE"?!equipment.includes(item.itemType):
  ![...equipment,...other].includes(item.itemType))
  throw new Error("La receta no admite este tipo de producto.");
}
