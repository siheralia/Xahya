import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {randomInt} from "node:crypto";
import {Temporal} from "@js-temporal/polyfill";
import {db} from "@/lib/db";
import type {CombatState,Side} from "@/lib/combat/turn-engine";
import type {TimelineCombatCommand} from "@/lib/combat/combat-timeline-adapter";
import {
 declareTimelineCommand,type TimelineDeclarationSession,
} from "@/lib/combat/timeline-declarations";
import {
 assertTimelinePair,timelinePilotClientView,timelinePersistenceDelta,
 runTimelinePilotWindow,timelinePilotEnabled,
} from "@/lib/combat/timeline-pilot-persistence";
import {combatSnapshotEtag,combatEtagMatches} from "@/lib/combat/poll-cache";
import {canApproveCombat} from "@/lib/combat/permissions";
import {compileCombatSkill} from "@/lib/combat/skill-casting";
import {readModularCutover} from "@/lib/effects/modular-cutover-registry";
import {attachedCreationPassive} from "@/lib/combat/constructs";
import {meetsEffectRequirements} from "@/lib/skills/effect-requirements";
import {advanceCombatMechanics} from "@/lib/skills/mechanics-runtime";

const roll=()=>({hit:randomInt(1_000_000)/1_000_000,
 critical:randomInt(1_000_000)/1_000_000,
 defense:randomInt(1_000_000)/1_000_000});
const allowed:Record<string,readonly string[]>={
 WAIT:["kind","requestId"],
 MOVE:["kind","requestId","direction","meters","planarMove"],
 GUARD:["kind","requestId","weaponSlot"],
 PREPARE_REACTION:["kind","requestId","defense","predictedCenter",
   "defenseAngle","dodgeDirection","counterMagic"],
 ATTACK:["kind","requestId","attackType","trajectory","usesMagic",
   "areaCenter","attackSource","planarMove","movementOrder"],
 CAST_SKILL:["kind","requestId","skillId","trajectory","areaCenter",
   "areaAngleDegrees","attackSource","planarMove","movementOrder",
   "constructionFieldPoint","constructionHeightMeters",
   "constructionFootprintRadiusMeters","constructionSolidHeightMeters",
   "constructionForm","constructionLabel"],
 COMMAND_SUMMON:["kind","requestId","summonId","order","targetId",
   "newBehavior","planarMove"],
 USE_ITEM:["kind","requestId","itemId","characterItemId"],
};
function pilotCommand(raw:unknown):TimelineCombatCommand{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
   throw new Error("La declaración temporal debe ser un objeto.");
 const c=raw as Record<string,unknown>;
 const kind=String(c.kind??"");
 const keys=allowed[kind];
 if(!keys||Object.keys(c).some(key=>!keys.includes(key)))
   throw new Error("La orden contiene campos o habilidades aún no admitidos en V2.");
 if(typeof c.requestId!=="string"||
   !/^[a-zA-Z0-9_:-]{12,70}$/.test(c.requestId))
   throw new Error("Cada acción V2 requiere un recibo de solicitud único.");
 return c as TimelineCombatCommand;
}
async function load(id:string){
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 const encounterId=Number(id);
 if(!user||!Number.isSafeInteger(encounterId)||encounterId<1)return null;
 const Session=(db.orm.public as any).CombatSession;
 const session=await Session.where({id:encounterId}).first();
 const store=(session?.lastAction??{}) as Record<string,unknown>;
 const combat=store.combatV1 as CombatState|undefined;
 const timeline=store.combatTimelineV2 as TimelineDeclarationSession|undefined;
 if(!combat||combat.version!==1||timeline?.version!==2)return null;
 const ids=[combat.actors.PLAYER.characterId,combat.actors.NPC.characterId];
 if(ids.some(id=>id===null))return null;
 const [player,npc,gm]=await Promise.all([
   db.orm.public.Character.where({id:Number(ids[0])}).first(),
   db.orm.public.Character.where({id:Number(ids[1])}).first(),
   canApproveCombat(user),
 ]);
 const canPlayer=gm||!!player&&Number(player.userId)===Number(user.id);
 const canOpponent=gm||!!npc&&Number(npc.userId)===Number(user.id);
 if(!canPlayer&&!canOpponent)return null;
 return {encounterId,combat,timeline,canPlayer,canOpponent,session};
}
function exposed(
 c:CombatState,t:TimelineDeclarationSession,
 canPlayer:boolean,canOpponent:boolean,
){
 return {...timelinePilotClientView(c,t),
   permissions:{PLAYER:canPlayer,NPC:canOpponent}};
}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!timelinePilotEnabled())
   return NextResponse.json({error:"La prueba V2 está deshabilitada."},{status:404});
 const a=await load((await params).id);
 if(!a)return NextResponse.json({error:"Encuentro V2 inexistente o sin permiso."},{status:403});
 try{
  const payload=JSON.stringify(exposed(a.combat,a.timeline,a.canPlayer,a.canOpponent));
  const etag=combatSnapshotEtag(payload);
  const headers={"ETag":etag,"Cache-Control":"private, no-store","Vary":"Cookie"};
  if(combatEtagMatches(req.headers.get("if-none-match"),etag))
    return new NextResponse(null,{status:304,headers});
  return new NextResponse(payload,{status:200,
    headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Estado inválido."},
   {status:409});}
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!timelinePilotEnabled())
   return NextResponse.json({error:"La prueba V2 está deshabilitada."},{status:404});
 const a=await load((await params).id);
 if(!a)return NextResponse.json({error:"Encuentro V2 inexistente o sin permiso."},{status:403});
 const body=await req.json().catch(()=>null);
 const side=body?.side as Side;
 if((side!=="PLAYER"&&side!=="NPC")||
   side==="PLAYER"&&!a.canPlayer||
   side==="NPC"&&!a.canOpponent)
   return NextResponse.json({error:"No tienes permiso para ese combatiente."},{status:403});
 try{
  const command=pilotCommand(body.command);
  const result=await db.transaction(async tx=>{
   // Same serialization contract as the V1 actions route: both players,
   // replay receipts, all item debits and battle state are one transaction.
   const lock=db.raw.sql`UPDATE public."combatSession"
     SET id=id WHERE id=${a.encounterId}`.affectedCount().build();
   if((await tx.execute(lock)).affectedRows!==1)
     throw new Error("COMBAT_NOT_FOUND");
   const Session=(tx.orm.public as any).CombatSession;
   const fresh=await Session.where({id:a.encounterId}).first();
   const previous=(fresh?.lastAction??{}) as Record<string,unknown>;
   const combat=previous.combatV1 as CombatState|undefined;
   const clock=previous.combatTimelineV2 as TimelineDeclarationSession|undefined;
   if(!combat||!clock||clock.version!==2||combat.version!==1)
     throw new Error("El encuentro no tiene un reloj V2 autorizado.");
   assertTimelinePair(combat,clock);
   if(fresh.status!=="ACTIVE"||combat.status!=="ACTIVE")
     throw new Error("Este encuentro ha terminado.");
   const characterId=combat.actors[side].characterId;
   if(characterId===null)throw new Error("Este encuentro V2 requiere dos personajes.");
   // No client-supplied skill mechanics. Look up the actual approved skill
   // with prerequisites, temporary theft and activation status from the DB.
   let approvedSkill:ReturnType<typeof compileCombatSkill>|undefined;
   if(command.kind==="CAST_SKILL"){
     const Skill=(tx.orm.public as any).Skill;
     const skillId=Number(command.skillId);
     if(!Number.isSafeInteger(skillId)||skillId<1)
       throw new Error("Habilidad V2 inválida.");
     const owned=await Skill.where({id:skillId,characterId,status:"APPROVED"}).first();
     if(!owned)throw new Error("La habilidad no está aprobada para tu personaje.");
     const stolenQuery=db.raw.sql`
       SELECT "sourceSkillId" AS "id" FROM public."skillTheft"
       WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
     `.returnsRow({id:"pg/int4@1"}).build();
     const stolenIds=new Set((await db.runtime().query(stolenQuery) as Array<{id:number}>)
       .map(x=>Number(x.id)));
     if(stolenIds.has(skillId))throw new Error("No puedes usar una habilidad robada.");
     const available=await Skill.where({characterId,status:"APPROVED"}).all();
     const others=available.filter((x:any)=>Number(x.id)!==skillId&&
       !stolenIds.has(Number(x.id)));
     if(!meetsEffectRequirements(
       Array.isArray(owned.effectRequirements)?owned.effectRequirements:[],others))
       throw new Error("Faltan prerrequisitos de la habilidad.");
     const {mode}=await readModularCutover();
     approvedSkill=compileCombatSkill(owned,mode);
     if(!["OFFENSE","SUPPORT","CONSTRUCTION","SUMMON"].includes(
       approvedSkill.category))
       throw new Error("Esta categoría necesita el resolutor avanzado de V2.");
     if(approvedSkill.requiredParentSkillId&&!others.some((x:any)=>
       Number(x.id)===approvedSkill!.requiredParentSkillId))
       throw new Error("Falta la habilidad familiar requerida.");
     if(approvedSkill.approvedActivation||approvedSkill.approvedHostileStatus||
       approvedSkill.approvedHybridContact){
       const SkillState=(tx.orm.public as any).CharacterSkillState;
       const activation=SkillState?await SkillState.where({characterId,skillId}).first():null;
       if(activation?.active===false)
         throw new Error("La habilidad modular está desactivada para el personaje.");
     }
     if(approvedSkill.category==="CONSTRUCTION")
       approvedSkill.creationPassive=attachedCreationPassive(skillId,available);
   }
   const eventId=side+":"+command.requestId;
   const existing=Object.hasOwn(clock.receipts,eventId);
   const declared=declareTimelineCommand(clock,combat,side,command,eventId,
     approvedSkill?{approvedSkill}:{});
   if(existing){
     // Idempotent retry: declaration signature was verified above; no NPC,
     // world event, AP, mana or inventory is progressed a second time.
     return {combat,timeline:declared};
   }
   let mechanics=fresh.mechanicsState;
   let skillCatalog:unknown[]|undefined,activeSkills:number[]|undefined;
   const advanced=await runTimelinePilotWindow(combat,declared,roll,
     async(before,after)=>{
       const delta=timelinePersistenceDelta(before,after);
       for(const item of delta.items){
         const q=db.raw.sql`
           UPDATE public."characterItem"
           SET quantity=quantity-${item.quantity}
           WHERE id=${item.characterItemId}
             AND "characterId"=${item.characterId}
             AND "itemId"=${item.itemId}
             AND quantity>=${item.quantity}
         `.affectedCount().build();
         if((await tx.execute(q)).affectedRows!==1)
           throw new Error("La poción no tiene existencias en el inventario real.");
         await (tx.orm.public as any).CharacterItem.where({
           id:item.characterItemId,quantity:0}).delete();
       }
       for(const gear of delta.equipment){
         const q=gear.repaired>0?db.raw.sql`
           UPDATE public."characterItem"
           SET durability=GREATEST(0,LEAST(100,
             LEAST(durability,${gear.before})-${gear.worn}+${gear.repaired}))
           WHERE id=${gear.characterItemId}
             AND "characterId"=${gear.characterId}
             AND "itemId"=${gear.itemId} AND quantity=1
         `.affectedCount().build():db.raw.sql`
           UPDATE public."characterItem"
           SET durability=LEAST(durability,${gear.after})
           WHERE id=${gear.characterItemId}
             AND "characterId"=${gear.characterId}
             AND "itemId"=${gear.itemId} AND quantity=1
         `.affectedCount().build();
         if((await tx.execute(q)).affectedRows!==1)
           throw new Error("No se pudo persistir la durabilidad del equipo V2.");
       }
       if(after.round>before.round){
         if(!skillCatalog||!activeSkills){
           const Skill=(tx.orm.public as any).Skill;
           const SkillState=(tx.orm.public as any).CharacterSkillState;
           skillCatalog=Skill?await Skill.where({
             characterId:combat.actors.PLAYER.characterId}).all():[];
           const flags=SkillState?await SkillState.where({
             characterId:combat.actors.PLAYER.characterId,active:true}).all():[];
           activeSkills=flags.map((x:any)=>Number(x.skillId));
         }
         for(let turn=before.round;turn<after.round;turn++)
           mechanics=advanceCombatMechanics(mechanics,
             combat.actors.PLAYER.characterId!,skillCatalog,activeSkills);
       }
     });
   const next=advanced.combat,session=advanced.timeline;
   await Session.where({id:a.encounterId}).update({
     lastAction:{combatV1:next,combatTimelineV2:session},
     mechanicsState:mechanics,currentTick:next.tick,turn:next.round,
     status:next.status,
     activeActor:session.clock.events.some(e=>e.owner==="PLAYER"&&e.status==="QUEUED")
       ?"NPC":"PLAYER",
     playerNextActionTick:session.clock.actors.PLAYER.availableAtTick,
     npcNextActionTick:session.clock.actors.NPC.availableAtTick,
     updatedAt:Temporal.Now.instant(),
   });
   return {combat:next,timeline:session};
  });
  return NextResponse.json(exposed(result.combat,result.timeline,a.canPlayer,a.canOpponent));
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:
    "No se pudo ejecutar la acción de tiempo continuo."},{status:400});
 }
}
