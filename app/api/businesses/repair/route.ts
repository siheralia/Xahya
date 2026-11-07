import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getEffectiveCharacterStats} from "@/lib/stats/effective";
import {repairSkillStats} from "@/lib/effects/repair-activation";
import {evaluateBusinessRepairService} from "@/lib/business-repair";
import {MANAGED_REPAIR_SERVICES_KEY,readManagedRepairServices,authorizedRepairServices} from "@/lib/managed-repair-services";

const valid=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
/** Buy a workshop repair with character-owned currency and/or materials.
 * A server-locked character, real selected copy and business are authoritative.
 * An audit replay key makes network retries return the original result.
 */
export async function POST(req:Request){
 const {userId:clerkId}=await auth();
 if(!clerkId)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 if(!user)return NextResponse.json({error:"Usuario no encontrado."},{status:401});
 const body=await req.json().catch(()=>null);
 const businessId=body?.businessId,characterId=body?.characterId,
  characterItemId=body?.characterItemId,serviceId=body?.serviceId,requestId=body?.requestId;
 if(!valid(businessId)||!valid(characterId)||!valid(characterItemId)||
  typeof serviceId!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(serviceId)||
  typeof requestId!=="string"||!/^Workshop[A-Za-z0-9_-]{12,80}$/.test(requestId))
  return NextResponse.json({error:"Solicitud de reparación inválida."},{status:400});
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!character||Number(character.userId)!==Number(user.id))
  return NextResponse.json({error:"Solo puedes solicitar reparaciones para tus personajes."},{status:403});
 try{
  const result=await db.transaction(async tx=>{
   const lockCharacter=db.raw.sql`UPDATE public."character" SET id=id WHERE id=${characterId}`.affectedCount().build();
   if((await tx.execute(lockCharacter)).affectedRows!==1)throw new Error("CHARACTER_NOT_FOUND");
   const currentCharacter=await tx.orm.public.Character.where({id:characterId}).first();
   if(!currentCharacter||Number(currentCharacter.userId)!==Number(user.id))
    throw new Error("CHARACTER_CHANGED");
   const Audit=(tx.orm.public as any).AuditLog;
   const previous=await Audit.where({
    characterId,action:"BUSINESS_ITEM_REPAIR",entityType:"BUSINESS",
   }).all();
   for(const entry of previous){
    let data:any;try{data=typeof entry.details==="string"?JSON.parse(entry.details):entry.details;}catch{}
    if(data?.requestId===requestId){
     if(data.characterItemId!==characterItemId||data.serviceId!==serviceId||
        Number(data.result?.businessId)!==businessId)
      throw new Error("REQUEST_REUSED");
     return {...data.result,replayed:true};
    }
   }
   // Services are prohibited during any real active encounter. The opponent
   // must not gain a free inventory repair behind an ongoing PvP fight.
   const inCombat=db.raw.sql`
     SELECT id FROM public."combatSession" WHERE status='ACTIVE'
       AND ("playerCharacterId"=${characterId}
         OR "npcStats"->>'opponentCharacterId'=${String(characterId)})
     LIMIT 1
   `.returnsRow({id:"pg/int4@1"}).build();
   if((await db.runtime().query(inCombat)).length)throw new Error("IN_COMBAT");
   const lockedBusiness=db.raw.sql`UPDATE public."business" SET id=id WHERE id=${businessId}`.affectedCount().build();
   if((await tx.execute(lockedBusiness)).affectedRows!==1)throw new Error("BUSINESS_NOT_FOUND");
   const Business=(tx.orm.public as any).Business;
   const business=await Business.where({id:businessId}).first();
   if(!business||business.active!==true)throw new Error("BUSINESS_INACTIVE");
   // Lock the same global catalog as admin writes. Revocation and purchase
   // serialize; legacy owner-authored per-business services never execute.
   const lockCatalog=db.raw.sql`UPDATE public."appSetting" SET id=id
     WHERE key=${MANAGED_REPAIR_SERVICES_KEY}`.affectedCount().build();
   if((await tx.execute(lockCatalog)).affectedRows!==1)throw new Error("SERVICE_UNAVAILABLE");
   const setting=await (tx.orm.public as any).AppSetting
    .where({key:MANAGED_REPAIR_SERVICES_KEY}).first();
   const service=authorizedRepairServices(
    readManagedRepairServices(setting?.value),businessId
   ).find(x=>x.id===serviceId);
   if(!service)throw new Error("SERVICE_UNAVAILABLE");
   if(service.customerAccess==="OWNER_ONLY"&&Number(business.ownerCharacterId)!==characterId)
    throw new Error("SERVICE_PRIVATE");
   if(service.requiresEmployee){
    const positions=await (tx.orm.public as any).BusinessPosition.where({businessId}).all();
    let staffed=false;
    for(const pos of positions){
     if(!pos.active)continue;
     const contracts=await (tx.orm.public as any).EmploymentContract.where({positionId:Number(pos.id)}).all();
     if(contracts.some((row:any)=>row.active)){staffed=true;break;}
    }
    if(!staffed)throw new Error("STAFF_UNAVAILABLE");
   }
   // Lock selected copy before reading its durability. Also guard quantity
   // and item ownership; an arbitrary catalog item cannot be repaired for free.
   const lockItem=db.raw.sql`
     UPDATE public."characterItem" SET id=id WHERE id=${characterItemId}
       AND "characterId"=${characterId} AND quantity=1
   `.affectedCount().build();
   if((await tx.execute(lockItem)).affectedRows!==1)throw new Error("ITEM_UNAVAILABLE");
   const CI=(tx.orm.public as any).CharacterItem,Item=(tx.orm.public as any).Item;
   const selected=await CI.where({id:characterItemId,characterId}).first();
   const definition=selected?await Item.where({id:Number(selected.itemId)}).first():null;
   if(!selected||!definition||!["WEAPON","ARMOR","ACCESSORY","OTHER"].includes(String(definition.itemType)))
    throw new Error("ITEM_UNAVAILABLE");
   const before=Number(selected.durability);
   if(!Number.isSafeInteger(before)||before<0||before>100||before===100)
    throw new Error("ITEM_FULL");
   // Stats in a service belong to the *reparador* (business owner), not to
   // arbitrary user-supplied stats or target character bonuses.
   const ownerId=Number(business.ownerCharacterId);
   const stats=await getEffectiveCharacterStats(ownerId,tx);
   if(!stats)throw new Error("STATS_MISSING");
   const derived=stats.derived as Record<string,number>;
   const ownerResource=await tx.orm.public.CharacterResource.where({characterId:ownerId}).first();
   const staffStats=repairSkillStats(
    stats.effectiveStats as Record<string,number>,derived,
    Math.max(1,Number(derived.maxHp??1)),
    ownerResource?.currentMana==null?Math.max(0,Number(derived.maxMana??0)):
      Number(ownerResource.currentMana));
   const repair=evaluateBusinessRepairService(service,{characterItemId,durability:before},staffStats);
   const Resources=tx.orm.public.CharacterResource;
   const lockResources=db.raw.sql`
     UPDATE public."characterResource" SET id=id WHERE "characterId"=${characterId}
   `.affectedCount().build();
   if((await tx.execute(lockResources)).affectedRows!==1)throw new Error("NO_RESOURCES");
   const resource=await Resources.where({characterId}).first();
   if(!resource)throw new Error("NO_RESOURCES");
   const money=Number(resource.money);
   if(!Number.isSafeInteger(money)||money<service.fee)throw new Error("NO_MONEY");
   const consumed:Array<{characterItemId:number;itemId:number;quantity:number}>=[];
   if(service.materialItemId!==null){
    const material=await Item.where({id:service.materialItemId}).first();
    if(!material||String(material.itemType)!=="MATERIAL")throw new Error("MATERIAL_UNAVAILABLE");
    const copies=(await CI.where({characterId,itemId:service.materialItemId}).all())
     .filter((x:any)=>!x.equipped&&Number(x.id)!==characterItemId)
     .sort((a:any,b:any)=>Number(a.id)-Number(b.id));
    let remaining=service.materialQuantity;
    for(const copy of copies){
     if(remaining===0)break;
     const lock=db.raw.sql`
       UPDATE public."characterItem" SET id=id
       WHERE id=${copy.id} AND "characterId"=${characterId} AND "itemId"=${service.materialItemId}
         AND equipped=false AND quantity>=1
     `.affectedCount().build();
     if((await tx.execute(lock)).affectedRows!==1)continue;
     const fresh=await CI.where({id:Number(copy.id),characterId}).first();
     if(!fresh||fresh.equipped)continue;
     const available=Number(fresh.quantity);
     if(!Number.isSafeInteger(available)||available<1)continue;
     const take=Math.min(remaining,available);
     const debit=db.raw.sql`
       UPDATE public."characterItem" SET quantity=quantity-${take}
       WHERE id=${copy.id} AND "characterId"=${characterId}
         AND "itemId"=${service.materialItemId} AND equipped=false AND quantity>=${take}
     `.affectedCount().build();
     if((await tx.execute(debit)).affectedRows!==1)throw new Error("MATERIAL_CHANGED");
     if(available===take)await CI.where({id:Number(copy.id),characterId,quantity:0}).delete();
     consumed.push({characterItemId:Number(copy.id),itemId:service.materialItemId,quantity:take});
     remaining-=take;
    }
    if(remaining!==0)throw new Error("NO_MATERIALS");
   }
   if(service.fee>0){
    await Resources.where({id:resource.id}).update({money:money-service.fee});
    await Business.where({id:businessId}).update({balance:Number(business.balance)+service.fee});
   }
   // All gains are additive under the locked row and may never exceed 100.
   // Never replay a repair against a stale client durability snapshot.
   const update=db.raw.sql`
     UPDATE public."characterItem"
       SET durability=LEAST(100,durability+${repair.applied})
     WHERE id=${characterItemId} AND "characterId"=${characterId}
       AND "itemId"=${selected.itemId} AND quantity=1
   `.affectedCount().build();
   if((await tx.execute(update)).affectedRows!==1)throw new Error("ITEM_CHANGED");
   const after=Math.min(100,before+repair.applied);
   const result={success:true,businessId,serviceId,characterItemId,
     before,after,restored:repair.applied,fee:service.fee,
     materials:consumed,money:money-service.fee};
   await Audit.create({
    actorUserId:Number(user.id),action:"BUSINESS_ITEM_REPAIR",entityType:"BUSINESS",
    entityId:businessId,characterId,targetUserId:null,
    details:JSON.stringify({requestId,characterItemId,serviceId,result}),
   });
   return result;
  });
  return NextResponse.json(result);
 }catch(error){
  const code=error instanceof Error?error.message:"REPAIR_FAILED";
  const labels:Record<string,string>={
   CHARACTER_NOT_FOUND:"Personaje no encontrado.",
   CHARACTER_CHANGED:"El personaje cambió de propietario; vuelve a consultar tus personajes.",
   REQUEST_REUSED:"Ese identificador de operación ya se utilizó para otra reparación.",
   IN_COMBAT:"No puedes utilizar un taller mientras este personaje participa en un combate.",
   BUSINESS_NOT_FOUND:"Negocio no encontrado.",BUSINESS_INACTIVE:"Este negocio no está disponible.",
   SERVICE_UNAVAILABLE:"El servicio ya no está disponible.",
   SERVICE_PRIVATE:"Este servicio está reservado al propietario del negocio.",
   STAFF_UNAVAILABLE:"El taller necesita un empleado contratado activo.",
   ITEM_UNAVAILABLE:"Ese ejemplar no te pertenece o no se puede reparar.",
   ITEM_FULL:"Este ejemplar ya tiene toda su durabilidad.",
   STATS_MISSING:"No se pudieron calcular las estadísticas del reparador.",
   NO_RESOURCES:"El personaje no tiene recursos registrados.",
   NO_MONEY:"Dinero insuficiente para pagar el servicio.",
   MATERIAL_UNAVAILABLE:"El material requerido dejó de existir.",
   MATERIAL_CHANGED:"Los materiales cambiaron durante el cobro.",
   NO_MATERIALS:"No tienes suficientes materiales para esta reparación.",
   ITEM_CHANGED:"El inventario cambió durante la reparación; vuelve a intentarlo.",
  };
  return NextResponse.json({error:labels[code]??(error instanceof Error?error.message:"No se pudo reparar.")},{status:code==="SERVICE_PRIVATE"||code==="ITEM_UNAVAILABLE"?403:409});
 }
}
