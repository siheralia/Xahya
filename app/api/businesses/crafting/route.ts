import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {
 MANAGED_CRAFT_RECIPES_KEY,readManagedCraftRecipes,authorizedCraftRecipes,
 validateCraftOutput,allocateCraftMaterials
} from "@/lib/managed-crafting";

const positive=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>0;
export async function GET(req:Request){
 const {userId:clerkId}=await auth();
 if(!clerkId)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 if(!user)return NextResponse.json({error:"Usuario desconocido."},{status:401});
 const requested=new URL(req.url).searchParams.get("businessId");
 const businessId=requested===null?null:Number(requested);
 if(businessId!==null&&!positive(businessId))
  return NextResponse.json({error:"Negocio inválido."},{status:400});
 const [setting,businesses,items]=await Promise.all([
  (db.orm.public as any).AppSetting.where({key:MANAGED_CRAFT_RECIPES_KEY}).first(),
  (db.orm.public as any).Business.all(),
  (db.orm.public as any).Item.all()
 ]);
 const catalog=readManagedCraftRecipes(setting?.value);
 const index=new Map<number,any>(items.map((item:any)=>[Number(item.id),item]));
 const available=businesses.filter((b:any)=>b.active===true&&
  (businessId===null||Number(b.id)===businessId)).flatMap((b:any)=>{
  return authorizedCraftRecipes(catalog,Number(b.id)).flatMap(recipe=>{
   const output=index.get(recipe.outputItemId);
   if(!output)return [];
   try{validateCraftOutput(recipe,{
    id:Number(output.id),itemType:String(output.itemType),
    acquisitionType:String(output.acquisitionType),propertyBusinessId:output.propertyBusinessId
   });}catch{return [];}
   const materials=recipe.ingredients.map(ingredient=>{
    const item=index.get(ingredient.itemId);
    return item&&String(item.itemType)==="MATERIAL"?
     {itemId:ingredient.itemId,name:String(item.name),quantity:ingredient.quantity}:null;
   });
   if(materials.some(x=>x===null))return [];
   return [{
    businessId:Number(b.id),businessName:String(b.name),
    recipe:{...recipe,businessIds:undefined},
    output:{id:Number(output.id),name:String(output.name),itemType:String(output.itemType)},
    materials
   }];
  });
 });
 return NextResponse.json({offers:available});
}

/** One atomic operation: locked ownership, active eligibility, exact material
 * stacks, money, business payment, catalog output and audit replay ledger.
 */
export async function POST(req:Request){
 const {userId:clerkId}=await auth();
 if(!clerkId)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 if(!user)return NextResponse.json({error:"Usuario no encontrado."},{status:401});
 const body=await req.json().catch(()=>null);
 const businessId=body?.businessId,characterId=body?.characterId,
  recipeId=body?.recipeId,requestId=body?.requestId;
 if(!positive(businessId)||!positive(characterId)||
  typeof recipeId!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(recipeId)||
  typeof requestId!=="string"||!/^Craft[A-Za-z0-9_-]{12,80}$/.test(requestId))
  return NextResponse.json({error:"Solicitud de fabricación inválida."},{status:400});
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!character||Number(character.userId)!==Number(user.id))
  return NextResponse.json({error:"Solo puedes fabricar para tus personajes."},{status:403});
 try{
  const result=await db.transaction(async tx=>{
   const lockCharacter=db.raw.sql`
    UPDATE public."character" SET id=id WHERE id=${characterId}
   `.affectedCount().build();
   if((await tx.execute(lockCharacter)).affectedRows!==1)
    throw new Error("CHARACTER_MISSING");
   const current=await tx.orm.public.Character.where({id:characterId}).first();
   if(!current||Number(current.userId)!==Number(user.id))
    throw new Error("CHARACTER_CHANGED");
   const Audit=(tx.orm.public as any).AuditLog;
   // A retry returns the original receipt, before balance/eligibility checks.
   const previous=await Audit.where({characterId,action:"BUSINESS_ITEM_CRAFT",
    entityType:"BUSINESS"}).all();
   for(const record of previous){
    let data:any;
    try{data=typeof record.details==="string"?JSON.parse(record.details):record.details;}catch{}
    if(data?.requestId!==requestId)continue;
    if(data?.businessId!==businessId||data?.recipeId!==recipeId||
     data?.characterId!==characterId)throw new Error("REPLAY_MISMATCH");
    return {...data.result,replayed:true};
   }
   // As with workshop repairs, crafting outside the action resolver is blocked
   // for either side of an ongoing PvP encounter.
   const combat=db.raw.sql`
    SELECT id FROM public."combatSession" WHERE status='ACTIVE' AND
     ("playerCharacterId"=${characterId}
      OR "npcStats"->>'opponentCharacterId'=${String(characterId)})
    LIMIT 1
   `.returnsRow({id:"pg/int4@1"}).build();
   if((await db.runtime().query(combat)).length)throw new Error("IN_COMBAT");
   const lockBusiness=db.raw.sql`
    UPDATE public."business" SET id=id WHERE id=${businessId}
   `.affectedCount().build();
   if((await tx.execute(lockBusiness)).affectedRows!==1)
    throw new Error("BUSINESS_MISSING");
   const Business=(tx.orm.public as any).Business;
   const business=await Business.where({id:businessId}).first();
   if(!business||business.active!==true)throw new Error("BUSINESS_INACTIVE");
   const lockCatalog=db.raw.sql`
    UPDATE public."appSetting" SET id=id
    WHERE key=${MANAGED_CRAFT_RECIPES_KEY}
   `.affectedCount().build();
   if((await tx.execute(lockCatalog)).affectedRows!==1)
    throw new Error("RECIPE_UNAVAILABLE");
   const setting=await (tx.orm.public as any).AppSetting
    .where({key:MANAGED_CRAFT_RECIPES_KEY}).first();
   const recipe=authorizedCraftRecipes(
    readManagedCraftRecipes(setting?.value),businessId
   ).find(x=>x.id===recipeId);
   if(!recipe)throw new Error("RECIPE_UNAVAILABLE");
   if(recipe.customerAccess==="OWNER_ONLY"&&
    Number(business.ownerCharacterId)!==characterId)throw new Error("CUSTOMER_RESTRICTED");
   if(recipe.requiresEmployee){
    const positions=await (tx.orm.public as any).BusinessPosition.where({businessId}).all();
    let staffed=false;
    for(const p of positions){
     if(!p.active)continue;
     const contracts=await (tx.orm.public as any).EmploymentContract.where({positionId:Number(p.id)}).all();
     if(contracts.some((c:any)=>c.active)){staffed=true;break;}
    }
    if(!staffed)throw new Error("EMPLOYEE_REQUIRED");
   }
   const Item=(tx.orm.public as any).Item;
   const output=await Item.where({id:recipe.outputItemId}).first();
   if(!output)throw new Error("OUTPUT_INVALID");
   try{validateCraftOutput(recipe,{
    id:Number(output.id),itemType:String(output.itemType),
    acquisitionType:String(output.acquisitionType),propertyBusinessId:output.propertyBusinessId
   });}catch{throw new Error("OUTPUT_INVALID");}
   for(const ingredient of recipe.ingredients){
    const material=await Item.where({id:ingredient.itemId}).first();
    if(!material||String(material.itemType)!=="MATERIAL")
     throw new Error("MATERIAL_INVALID");
   }
   const lockMoney=db.raw.sql`
    UPDATE public."characterResource" SET id=id WHERE "characterId"=${characterId}
   `.affectedCount().build();
   if((await tx.execute(lockMoney)).affectedRows!==1)
    throw new Error("RESOURCES_MISSING");
   const resources=await tx.orm.public.CharacterResource.where({characterId}).first();
   const money=Number(resources?.money);
   if(!Number.isSafeInteger(money)||money<recipe.fee)
    throw new Error("INSUFFICIENT_MONEY");

   const CI=(tx.orm.public as any).CharacterItem;
   const stacks=await CI.where({characterId}).all();
   let planned:ReturnType<typeof allocateCraftMaterials>;
   try{planned=allocateCraftMaterials(recipe.ingredients,
    stacks.map((row:any)=>({id:Number(row.id),itemId:Number(row.itemId),
     quantity:Number(row.quantity),equipped:Boolean(row.equipped)}))
   );}catch{throw new Error("INSUFFICIENT_MATERIALS");}

   const consumed:typeof planned=[];
   for(const part of planned){
    // Conditional, atomic decrement: no double consumption on concurrent
    // requests or if another route already depleted / equipped this stack.
    const debit=db.raw.sql`
     UPDATE public."characterItem" SET quantity=quantity-${part.quantity}
     WHERE id=${part.characterItemId} AND "characterId"=${characterId}
      AND "itemId"=${part.itemId} AND equipped=false AND quantity>=${part.quantity}
    `.affectedCount().build();
    if((await tx.execute(debit)).affectedRows!==1)
     throw new Error("MATERIALS_CHANGED");
    const after=await CI.where({id:part.characterItemId,characterId}).first();
    if(after&&Number(after.quantity)===0)
     await CI.where({id:part.characterItemId,characterId,quantity:0}).delete();
    consumed.push(part);
   }
   if(recipe.fee>0){
    await tx.orm.public.CharacterResource.where({id:resources.id})
     .update({money:money-recipe.fee});
    await Business.where({id:businessId})
     .update({balance:Number(business.balance)+recipe.fee});
   }
   const createdIds:number[]=[];
   const individual=["WEAPON","ARMOR","ACCESSORY"].includes(String(output.itemType));
   const copies=individual?recipe.outputQuantity:1;
   for(let i=0;i<copies;i++){
    const owned=await CI.create({
     characterId,itemId:recipe.outputItemId,
     quantity:individual?1:recipe.outputQuantity,
     equipped:false,equippedSlot:null,durability:100
    });
    createdIds.push(Number(owned.id));
   }
   const receipt={success:true,businessId,recipeId,characterId,
    kind:recipe.kind,itemId:recipe.outputItemId,itemName:String(output.name),
    quantity:recipe.outputQuantity,characterItemIds:createdIds,
    fee:recipe.fee,money:money-recipe.fee,materials:consumed};
   await Audit.create({
    actorUserId:Number(user.id),action:"BUSINESS_ITEM_CRAFT",
    entityType:"BUSINESS",entityId:businessId,characterId,targetUserId:null,
    details:JSON.stringify({requestId,businessId,recipeId,characterId,result:receipt})
   });
   return receipt;
  });
  return NextResponse.json(result);
 }catch(err){
  const key=err instanceof Error?err.message:"CRAFT_FAILED";
  const descriptions:Record<string,string>={
   CHARACTER_MISSING:"Personaje no encontrado.",
   CHARACTER_CHANGED:"El personaje cambió de propietario.",
   REPLAY_MISMATCH:"Este identificador ya se usó para otra fabricación.",
   IN_COMBAT:"No se puede fabricar durante un combate activo.",
   BUSINESS_MISSING:"Negocio no encontrado.",
   BUSINESS_INACTIVE:"El negocio no está disponible.",
   RECIPE_UNAVAILABLE:"Esta receta no está autorizada o fue retirada.",
   CUSTOMER_RESTRICTED:"Este servicio está reservado al propietario del negocio.",
   EMPLOYEE_REQUIRED:"La receta requiere un empleado contratado y activo.",
   OUTPUT_INVALID:"El producto ya no es un objeto fabricable válido.",
   MATERIAL_INVALID:"Uno de los ingredientes dejó de ser un material válido.",
   RESOURCES_MISSING:"El personaje no tiene recursos registrados.",
   INSUFFICIENT_MONEY:"No tienes dinero suficiente.",
   INSUFFICIENT_MATERIALS:"No tienes suficientes materiales.",
   MATERIALS_CHANGED:"El inventario cambió durante la fabricación; vuelve a intentar.",
  };
  return NextResponse.json({error:descriptions[key]??"No se pudo fabricar el objeto."},
   {status:key==="CUSTOMER_RESTRICTED"||key==="CHARACTER_CHANGED"?403:409});
 }
}
