import {auth} from "@clerk/nextjs/server";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {
 MANAGED_CRAFT_RECIPES_KEY,readManagedCraftRecipes,normalizeManagedCraftRecipe,
 checkManagedCraftLimits,validateCraftOutput,type ManagedCraftRecipe
} from "@/lib/managed-crafting";

async function adminUser(){
 const {userId:clerkId}=await auth();
 if(!clerkId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 return user&&String(user.role)==="ADMIN"?user:null;
}
export async function GET(){
 const admin=await adminUser();
 if(!admin)return NextResponse.json({error:"Solo Gestión puede definir recetas."},{status:403});
 const [row,businesses,items]=await Promise.all([
  (db.orm.public as any).AppSetting.where({key:MANAGED_CRAFT_RECIPES_KEY}).first(),
  (db.orm.public as any).Business.all(),
  (db.orm.public as any).Item.all()
 ]);
 return NextResponse.json({
  recipes:readManagedCraftRecipes(row?.value),
  businesses:businesses.map((b:any)=>({id:Number(b.id),name:String(b.name),active:Boolean(b.active)})),
  materials:items.filter((i:any)=>String(i.itemType)==="MATERIAL")
   .map((i:any)=>({id:Number(i.id),name:String(i.name)})),
  outputs:items.filter((i:any)=>String(i.acquisitionType)==="CRAFTED"&&
   String(i.itemType)!=="PROPERTY"&&i.propertyBusinessId==null)
   .map((i:any)=>({id:Number(i.id),name:String(i.name),itemType:String(i.itemType)}))
 });
}
export async function POST(req:Request){
 const admin=await adminUser();
 if(!admin)return NextResponse.json({error:"Solo Gestión puede guardar recetas."},{status:403});
 const body=await req.json().catch(()=>null);
 if(!body||!["save","delete"].includes(body.action))
  return NextResponse.json({error:"Acción de fabricación inválida."},{status:400});
 try{
  const next=await db.transaction(async tx=>{
   const Setting=(tx.orm.public as any).AppSetting;
   const lock=db.raw.sql`
    UPDATE public."appSetting" SET id=id WHERE key=${MANAGED_CRAFT_RECIPES_KEY}
   `.affectedCount().build();
   await tx.execute(lock);
   const row=await Setting.where({key:MANAGED_CRAFT_RECIPES_KEY}).first();
   const catalog=readManagedCraftRecipes(row?.value);
   let next:ManagedCraftRecipe[];
   let changedId:string;
   if(body.action==="delete"){
    if(typeof body.recipeId!=="string"||!catalog.some(x=>x.id===body.recipeId))
     throw new Error("Receta no encontrada.");
    changedId=body.recipeId;
    next=catalog.filter(x=>x.id!==changedId);
   }else{
    const draft=body.recipe;
    if(!draft||typeof draft!=="object"||Array.isArray(draft))
     throw new Error("Receta inválida.");
    const recipe=normalizeManagedCraftRecipe({
     ...draft,id:draft.id||"Craft"+randomUUID().replaceAll("-","")
    });
    changedId=recipe.id;
    const businesses=await (tx.orm.public as any).Business.all();
    const registered=new Set<number>(businesses.map((b:any)=>Number(b.id)));
    if(recipe.businessIds.some(id=>!registered.has(id)))
     throw new Error("Asignaste un negocio inexistente.");
    const Item=(tx.orm.public as any).Item;
    const output=await Item.where({id:recipe.outputItemId}).first();
    if(!output)throw new Error("El objeto resultante no existe.");
    validateCraftOutput(recipe,{
     id:Number(output.id),itemType:String(output.itemType),
     acquisitionType:String(output.acquisitionType),propertyBusinessId:output.propertyBusinessId
    });
    for(const ingredient of recipe.ingredients){
     const item=await Item.where({id:ingredient.itemId}).first();
     if(!item||String(item.itemType)!=="MATERIAL")
      throw new Error("Los ingredientes deben ser materiales existentes del catálogo.");
    }
    const index=catalog.findIndex(x=>x.id===recipe.id);
    next=index<0?[...catalog,recipe]:catalog.map((x,i)=>i===index?recipe:x);
   }
   checkManagedCraftLimits(next);
   if(row)await Setting.where({id:row.id}).update({value:JSON.stringify(next)});
   else await Setting.create({key:MANAGED_CRAFT_RECIPES_KEY,value:JSON.stringify(next)});
   await (tx.orm.public as any).AuditLog.create({
    actorUserId:Number(admin.id),action:"MANAGED_CRAFT_RECIPE_CONFIG",
    entityType:"SYSTEM",entityId:null,characterId:null,targetUserId:null,
    details:JSON.stringify({action:body.action,recipeId:changedId,
     businessIds:next.find(x=>x.id===changedId)?.businessIds??[]})
   });
   return next;
  });
  return NextResponse.json({success:true,recipes:next});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo guardar la receta."},{status:400});
 }
}
