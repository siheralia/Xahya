import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {compileApprovedRepairSkill,evaluateApprovedRepairSkill,repairSkillStats} from "@/lib/effects/repair-activation";
import {getEffectiveCharacterStats} from "@/lib/stats/effective";
import {debitCharacterMana,locateSkillEnvironment,saveSkillEnvironment} from "@/lib/skills/mechanics-runtime";
import {cooldownAvailability,recordSkillCooldown} from "@/lib/skills/cooldown-runtime";
import {meetsEffectRequirements} from "@/lib/skills/effect-requirements";

/**
 * Manual repair is a REAL, serialized inventory mutation, never a generic
 * permission to run arbitrary effect-graph intents. The client provides only
 * an approved skill, an owned inventory copy and an idempotency key.
 * Skills that repair through turn passives, enchanted items or shop services
 * require their own trigger/payment adapter; none may call this route for free.
 */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {userId:clerkId}=await auth();
 if(!clerkId)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 if(!user)return NextResponse.json({error:"Usuario no encontrado."},{status:401});
 const characterId=Number((await params).id);
 const body=await request.json().catch(()=>null);
 const skillId=body?.skillId,selectedItemId=body?.characterItemId;
 const requestId=body?.requestId;
 if(!Number.isSafeInteger(characterId)||characterId<1||
    !Number.isSafeInteger(skillId)||skillId<1||
    !Number.isSafeInteger(selectedItemId)||selectedItemId<1||
    typeof requestId!=="string"||!/^Repair[A-Za-z0-9_-]{12,80}$/.test(requestId))
   return NextResponse.json({error:"Solicitud de reparación inválida."},{status:400});
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!character)return NextResponse.json({error:"Personaje no encontrado."},{status:404});
 if(Number(character.userId)!==Number(user.id)&&!["ADMIN","GM"].includes(String(user.role)))
   return NextResponse.json({error:"No puedes reparar el equipo de este personaje."},{status:403});
 try{
  const response=await db.transaction(async tx=>{
   // All manual repairs and their audit idempotency key serialize per
   // character BEFORE reading stock, mana, cooldowns or writing effects.
   const lock=db.raw.sql`UPDATE public."character" SET id=id WHERE id=${characterId}`.affectedCount().build();
   if((await tx.execute(lock)).affectedRows!==1)throw new Error("CHARACTER_NOT_FOUND");
   const TxAudit=(tx.orm.public as any).AuditLog;
   const prior=await TxAudit.where({
     characterId,action:"ITEM_REPAIR_SKILL",entityType:"SKILL",entityId:skillId,
   }).all();
   for(const entry of prior){
    const detail=typeof entry.details==="string"?JSON.parse(entry.details):entry.details;
    if(detail?.requestId===requestId)return {...detail.result,replayed:true};
   }
   const Skill=(tx.orm.public as any).Skill;
   const skill=await Skill.where({id:skillId,characterId,status:"APPROVED"}).first();
   if(!skill)throw new Error("SKILL_NOT_APPROVED");
   const plan=compileApprovedRepairSkill(skill);
   const available=await Skill.where({characterId,status:"APPROVED"}).all();
   const stolen=db.raw.sql`
     SELECT "sourceSkillId" AS id FROM public."skillTheft"
     WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
   `.returnsRow({id:"pg/int4@1"}).build();
   const stolenIds=new Set((await db.runtime().query(stolen) as Array<{id:number}>).map(x=>Number(x.id)));
   if(stolenIds.has(skillId))throw new Error("SKILL_STOLEN");
   const others=available.filter((row:any)=>Number(row.id)!==skillId&&!stolenIds.has(Number(row.id)));
   if(!meetsEffectRequirements(Array.isArray(skill.effectRequirements)?skill.effectRequirements:[],others))
     throw new Error("SKILL_REQUIREMENTS");
   const parentId=Number((skill.mechanics as any)?.parentSkillId??0);
   if(parentId>0&&!others.some((row:any)=>Number(row.id)===parentId))
     throw new Error("SKILL_REQUIREMENTS");
   const location=await locateSkillEnvironment(tx,characterId);
   if(location.kind==="COMBAT")throw new Error("REPAIR_IN_COMBAT");
   // A player can also be the opponent of a PvP session. These repairs do
   // not consume combat AP/ticks, so both sides must use the combat resolver.
   const pvp=db.raw.sql`
     SELECT id FROM public."combatSession" WHERE status='ACTIVE'
       AND "npcStats"->>'opponentCharacterId'=${String(characterId)}
     LIMIT 1
   `.returnsRow({id:"pg/int4@1"}).build();
   if((await db.runtime().query(pvp)).length)throw new Error("REPAIR_IN_COMBAT");
   const now=Date.now();
   const cooldown=cooldownAvailability(skill.cooldown,skill.duration,skill.category,
     location.state.cooldowns?.[String(skillId)],location.kind,location.state.turn,now);
   if(!cooldown.allowed)
     throw new Error(cooldown.reason==="COOLDOWN_COMBAT_ONLY"
       ?"REPAIR_COOLDOWN_COMBAT_ONLY":"REPAIR_COOLDOWN:"+cooldown.remainingTurns);

   const CharacterItem=(tx.orm.public as any).CharacterItem;
   const Item=(tx.orm.public as any).Item;
   const owned=await CharacterItem.where({characterId}).all();
   const selected=owned.find((row:any)=>Number(row.id)===selectedItemId);
   if(!selected)throw new Error("ITEM_NOT_OWNED");
   if(Number(selected.quantity)!==1)throw new Error("ITEM_STACK");
   const main=owned.find((row:any)=>row.equipped===true&&String(row.equippedSlot)==="MAIN_HAND");
   const off=owned.find((row:any)=>row.equipped===true&&String(row.equippedSlot)==="OFF_HAND");
   const selectors={
     SELECTED_ITEM:selectedItemId,
     ...(main?{OWNER_MAIN_HAND:Number(main.id)}:{}),
     ...(off?{OWNER_OFF_HAND:Number(off.id)}:{}),
   };
   // Only actual server-bound rows; lock in deterministic ascending order.
   const ids=[...new Set(Object.values(selectors))].sort((a,b)=>a-b);
   for(const id of ids){
     const rowLock=db.raw.sql`
       UPDATE public."characterItem" SET id=id
       WHERE id=${id} AND "characterId"=${characterId} AND quantity=1
     `.affectedCount().build();
     if((await tx.execute(rowLock)).affectedRows!==1)throw new Error("ITEM_CHANGED");
   }
   const targets=[];
   const resolvedItems=new Map<number,{itemId:number;durability:number}>();
   for(const id of ids){
     const entry=await CharacterItem.where({id,characterId}).first();
     const definition=entry?await Item.where({id:Number(entry.itemId)}).first():null;
     if(!entry||!definition||definition.itemType==="CONSUMABLE")throw new Error("ITEM_NOT_REPAIRABLE");
     const durability=Number(entry.durability);
     if(!Number.isSafeInteger(durability)||durability<0||durability>100)
       throw new Error("ITEM_INVALID_DURABILITY");
     targets.push({characterItemId:id,durability});
     resolvedItems.set(id,{itemId:Number(entry.itemId),durability});
   }
   const values=await getEffectiveCharacterStats(characterId,tx);
   if(!values)throw new Error("STATS_NOT_AVAILABLE");
   const resource=await tx.orm.public.CharacterResource.where({characterId}).first();
   if(!resource)throw new Error("MANA_RESOURCE_MISSING");
   const maxMana=Math.max(0,Math.floor(Number(values.derived?.maxMana??0)));
   const mana=resource.currentMana==null?maxMana:Number(resource.currentMana);
   // The character sheet has no persisted current HP outside encounters.
   // Repair plans reading current HP are rejected at compilation.
   const hp=Number(values.derived?.maxHp??1);
   const stats=repairSkillStats(
     values.effectiveStats as Record<string,number>,
     values.derived as Record<string,number>,hp,mana);
   const repairs=evaluateApprovedRepairSkill(plan,{
     stats,actors:{USER:stats},
     itemTargets:targets,itemSelectors:selectors,
   });
   // Refuse every mutation unless the exact inventory copy was locked here.
   const final=new Map<number,number>();
   const applied=new Map<number,number>();
   for(const intent of repairs){
     if(!resolvedItems.has(intent.characterItemId))throw new Error("ITEM_NOT_OWNED");
     final.set(intent.characterItemId,intent.after);
     applied.set(intent.characterItemId,(applied.get(intent.characterItemId)??0)+intent.applied);
   }
   const manaBalance=await debitCharacterMana(tx,characterId,plan.manaCost,maxMana);
   const changes=[];
   for(const [id,after] of final){
     const original=resolvedItems.get(id)!;
     await CharacterItem.where({id,characterId}).update({durability:after});
     changes.push({characterItemId:id,itemId:original.itemId,
       before:original.durability,after,restored:applied.get(id)??0});
   }
   if(skill.cooldown&&skill.cooldown!=="Sin cooldown")
     await saveSkillEnvironment(tx,location,{
       ...location.state,
       cooldowns:recordSkillCooldown(location.state.cooldowns,skillId,location.state.turn,now),
     });
   const result={success:true,skillId,skillName:String(skill.name),
     manaSpent:plan.manaCost,manaBalance,changes};
   await TxAudit.create({
     actorUserId:Number(user.id),action:"ITEM_REPAIR_SKILL",entityType:"SKILL",
     entityId:skillId,characterId,targetUserId:null,
     details:JSON.stringify({requestId,selectedItemId,result}),
   });
   return result;
  });
  return NextResponse.json(response);
 }catch(error){
  const code=error instanceof Error?error.message:"REPAIR_FAILED";
  const labels:Record<string,string>={
   CHARACTER_NOT_FOUND:"Personaje no encontrado.",
   SKILL_NOT_APPROVED:"La habilidad debe pertenecer al personaje y estar aprobada.",
   SKILL_STOLEN:"La habilidad está robada temporalmente.",
   SKILL_REQUIREMENTS:"No cumples los requisitos para usar esa habilidad.",
   REPAIR_IN_COMBAT:"No puedes reparar desde el inventario durante un combate. Utiliza las acciones del encuentro.",
   REPAIR_COOLDOWN_COMBAT_ONLY:"Esta habilidad solo puede utilizarse una vez por combate.",
   ITEM_NOT_OWNED:"Ese ejemplar no pertenece al inventario del personaje.",
   ITEM_STACK:"Separa una sola copia del montón antes de repararla.",
   ITEM_CHANGED:"El inventario cambió; vuelve a intentarlo.",
   ITEM_NOT_REPAIRABLE:"Solo se pueden reparar objetos físicos, no consumibles.",
   ITEM_INVALID_DURABILITY:"La durabilidad del objeto está dañada o fuera de rango.",
   MANA_INSUFFICIENT:"Maná insuficiente para reparar.",
   MANA_CHANGED:"El saldo de maná cambió; vuelve a intentarlo.",
   MANA_RESOURCE_MISSING:"El personaje no tiene sus recursos de maná inicializados.",
   STATS_NOT_AVAILABLE:"No están disponibles las estadísticas efectivas del personaje.",
  };
  const active=/^REPAIR_COOLDOWN:(\d+)$/.exec(code);
  const message=active?
    "Habilidad en cooldown. Faltan "+active[1]+" turno(s).":
    labels[code]??(error instanceof Error?error.message:"No se pudo reparar.");
  return NextResponse.json({error:message},{
    status:code==="ITEM_NOT_OWNED"||code==="SKILL_NOT_APPROVED"?404:409,
  });
 }
}
