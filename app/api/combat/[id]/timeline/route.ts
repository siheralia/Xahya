import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {randomInt} from "node:crypto";
import {Temporal} from "@js-temporal/polyfill";
import {db} from "@/lib/db";
import {canApproveCombat} from "@/lib/combat/permissions";
import {publicV2CombatState} from "@/lib/combat/timeline-client-projection";
import {combatSnapshotEtag,combatEtagMatches} from "@/lib/combat/poll-cache";
import {publicTimelineSessionStatus,isRecordedTimelineReplay,
 type TimelineDeclarationSession}
 from "@/lib/combat/timeline-declarations";
import {pendingTimelineSides} from "@/lib/combat/action-timeline";
import {publicPvPTimelineStatus,submitPvPTimelineCommand}
 from "@/lib/combat/timeline-pvp";
import type {Side} from "@/lib/combat/turn-engine";
import {advanceExperimentalTimeline,submitExperimentalTimelineCommand,
 parseExperimentalV2Command} from "@/lib/combat/timeline-experiment";
import {approvedLabSkillPlan,listApprovedLabSkills} from "@/lib/combat/timeline-lab-skills";
import {commitV2InventoryMutations} from "@/lib/combat/timeline-inventory-commit";
import {compileCombatConsumable} from "@/lib/items/combat-consumables";
import type {CombatState} from "@/lib/combat/turn-engine";

type SavedV2={version:2;clock:TimelineDeclarationSession["clock"];
 declarations:TimelineDeclarationSession["declarations"];
 receipts:TimelineDeclarationSession["receipts"];
 chargedReactionIds?:string[];usedCounterReactionIds?:string[];
 usedDodgeMovementIds?:string[]};
const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
 critical:randomInt(1_000_000)/1_000_000,
 defense:randomInt(1_000_000)/1_000_000});
const error=(message:string,status=400)=>
 NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
async function access(id:string){
 const {userId}=await auth();
 if(!userId)return null;
 const value=Number(id);
 if(!Number.isSafeInteger(value)||value<1)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 if(!user)return null;
 const Session=(db.orm.public as any).CombatSession;
 const session=await Session.where({id:value}).first();
 if(!session)return null;
 const player=await db.orm.public.Character.where({
   id:Number(session.playerCharacterId)}).first();
 const rivalId=Number((session.npcStats as any)?.opponentCharacterId??0);
 const rival=Number.isSafeInteger(rivalId)&&rivalId>0
   ?await db.orm.public.Character.where({id:rivalId}).first():null;
 const gm=await canApproveCombat(user);
 if(!player)return null;
 const ownedPlayer=Number(player.userId)===Number(user.id);
 const ownedRival=!!rival&&Number(rival.userId)===Number(user.id);
 if(!ownedPlayer&&!ownedRival&&!gm)return null;
 const viewerSide:Side|"SPECTATOR"=ownedPlayer?"PLAYER":
   ownedRival?"NPC":rival?"SPECTATOR":"PLAYER";
 return {session,sessionId:value,user,gm,viewerSide};
}
function read(saved:any):{combat:CombatState;timeline:TimelineDeclarationSession}{
 const combat=saved?.combatV1 as CombatState|undefined;
 const timeline=saved?.combatV2 as SavedV2|undefined;
 if(!combat||combat.version!==1||combat.timelineMode!=="SHARED"||
    !timeline||timeline.version!==2||!timeline.clock||
    combat.tick!==timeline.clock.nowTick)
   throw new Error("El encuentro no tiene una sesión V2 experimental válida.");
 return {combat,timeline};
}
function publicPayload(combat:CombatState,timeline:TimelineDeclarationSession,
 viewerSide:Side|"SPECTATOR"){
 // Frozen shooter and target/aim remain private, like uncommitted commands.
 const projected=publicV2CombatState(combat,viewerSide);
 const {timelineProjectiles:privateProjectiles,...state}=projected;
 const flying=(privateProjectiles??[]).map(({id,owner,launchTick,impactTick})=>
   ({id,owner,launchTick,impactTick}));
 const pvp=combat.actors.NPC.characterId!==null;
 return {mode:"EXPERIMENTAL_V2" as const,state,pvp,viewerSide,
   projectiles:flying,timeline:pvp
     ?publicPvPTimelineStatus(timeline,viewerSide==="SPECTATOR"?null:viewerSide,combat)
     :publicTimelineSessionStatus(timeline,combat),
   limitations:"Laboratorio V2: inventario y durabilidad de equipo reales, ficha HP/maná de combate aislada. Pasivas modulares avanzadas sujetas a compatibilidad."};
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const accessInfo=await access((await params).id);
 if(!accessInfo)return error("Combate no encontrado o sin autorización.",403);
 let payload;
 try{
   const saved=accessInfo.session.lastAction as any;
   const {combat,timeline}=read(saved);
   payload=publicPayload(combat,timeline,accessInfo.viewerSide);
 }catch{return error("Este combate no utiliza el laboratorio V2.",409);}
 // Only the owner (or management) can read the approved active loadout.
 // Expose IDs and labels, not the server-approved effect graph.
 const actingId=accessInfo.viewerSide==="SPECTATOR"?null:
   accessInfo.viewerSide==="NPC"
     ?Number((accessInfo.session.npcStats as any)?.opponentCharacterId??0)
     :Number(accessInfo.session.playerCharacterId);
 const skills=actingId?await listApprovedLabSkills(actingId).catch(()=>[]):[];
 const text=JSON.stringify({...payload,skills});
 const etag=combatSnapshotEtag(text);
 const headers={"ETag":etag,"Cache-Control":"private, no-store","Vary":"Cookie"};
 if(combatEtagMatches(req.headers.get("if-none-match"),etag))
   return new NextResponse(null,{status:304,headers});
 return new NextResponse(text,{status:200,
   headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const accessInfo=await access((await params).id);
 if(!accessInfo)return error("Combate no encontrado o sin autorización.",403);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")
   return error("Debes indicar una acción y su identificador.");
 try{
   const committed=await db.transaction(async tx=>{
     // One row lock covers: V2 receipts, PA budgets, NPC decisions,
     // projectile queue, HP/equipment damage and the session clock.
     const lock=db.raw.sql`UPDATE public."combatSession" SET id=id
       WHERE id=${accessInfo.sessionId}`.affectedCount().build();
     if((await tx.execute(lock)).affectedRows!==1)
       throw new Error("El encuentro ya no existe.");
     const Session=(tx.orm.public as any).CombatSession;
     const fresh=await Session.where({id:accessInfo.sessionId}).first();
     if(!fresh)throw new Error("El encuentro ya no existe.");
     const original=read(fresh.lastAction);
     const pvp=original.combat.actors.NPC.characterId!==null;
     const player=await tx.orm.public.Character.where({
       id:Number(fresh.playerCharacterId)}).first();
     const rival=pvp?await tx.orm.public.Character.where({
       id:Number(original.combat.actors.NPC.characterId)}).first():null;
     const ownsPlayer=player&&Number(player.userId)===Number(accessInfo.user.id);
     const ownsRival=rival&&Number(rival.userId)===Number(accessInfo.user.id);
     if(!player||(pvp
       ?!ownsPlayer&&!ownsRival
       :!ownsPlayer&&!accessInfo.gm))
       throw new Error("No controlas a este combatiente.");
     const owner:Side=pvp?(ownsPlayer?"PLAYER":"NPC"):"PLAYER";
     const advance=body.command?.kind==="ADVANCE";
     const cast=body.command?.kind==="CAST_SKILL";
     const useItem=body.command?.kind==="USE_ITEM";
     const actionId=String(body.requestId??"");
     const command=cast||useItem?{...body.command,requestId:actionId}:body.command;
     // The final strike may have committed while the HTTP response was
     // lost. Return the stored terminal snapshot ONLY for the identical
     // authenticated command and original receipt. No inventory/PA writes.
     if(original.combat.status!=="ACTIVE"||String(fresh.status)!=="ACTIVE"){
       if(advance)throw new Error("El combate experimental ya terminó.");
       const parsed=parseExperimentalV2Command(command);
       const same=isRecordedTimelineReplay(original.timeline,owner,parsed,
         "V2_"+owner+":"+actionId);
       if(!same)throw new Error("El combate experimental ya terminó.");
       return {...publicPayload(original.combat,original.timeline,
           accessInfo.viewerSide),replayed:true,batches:0};
     }
     const onBatch=async(before:CombatState,after:CombatState)=>
       commitV2InventoryMutations(before,after,tx);
     // ADVANCE is server-side NPC/workflow progress ONLY, not a paid action.
     if(advance&&(pvp||Object.keys(body.command).length!==1))
       throw new Error("Solo el entrenamiento admite avance autónomo del NPC.");
     // Compile inside the SAME session lock. A replay uses its persisted
     // receipt and never reruns a subsequently changed skill approval.
     const isReplay=Object.hasOwn(original.timeline.receipts,
       "V2_"+owner+":"+actionId);
     const approvedSkill=cast&&!isReplay
       ?await approvedLabSkillPlan(
          Number(original.combat.actors[owner].characterId),Number(command.skillId),tx)
       :undefined;
     // The original combat snapshot records exact item copy, action and
     // amount. Verify the official recipe has not changed since creation.
     if(useItem&&!isReplay){
       const stock=(original.combat.consumables?.[owner]??[]).find(x=>
         x.itemId===Number(command.itemId)&&
         x.characterItemId===Number(command.characterItemId));
       const Item=(tx.orm.public as any).Item;
       const row=await Item.where({id:Number(command.itemId)}).first();
       const recipe=row?compileCombatConsumable(row):null;
       if(!stock||!recipe||stock.action!==recipe.action||
         stock.amount!==recipe.amount)
         throw new Error("La receta o copia de inventario cambió. Crea un encuentro nuevo.");
     }
     const context=approvedSkill?{approvedSkill}:{};
     const result=advance
       ?{...await advanceExperimentalTimeline(original.combat,
          original.timeline,dice,20,onBatch),replayed:false}
       :pvp?await submitPvPTimelineCommand(
          original.combat,original.timeline,owner,command,actionId,dice,
          context,onBatch)
       :await submitExperimentalTimelineCommand(
          original.combat,original.timeline,command,actionId,dice,
          context,onBatch);
     if(!result.replayed&&result.batches>0||!result.replayed&&!advance){
       await Session.where({id:accessInfo.sessionId}).update({
         lastAction:{combatV1:result.combat,combatV2:result.timeline},
         currentTick:result.combat.tick,turn:result.combat.round,
         status:result.combat.status,
         activeActor:result.combat.status==="ACTIVE"&&
           !pendingTimelineSides(result.timeline.clock).includes("PLAYER")
            ?"NPC":"PLAYER",
         playerNextActionTick:result.timeline.clock.actors.PLAYER.availableAtTick,
         npcNextActionTick:result.timeline.clock.actors.NPC.availableAtTick,
         updatedAt:Temporal.Now.instant(),
       });
     }
     return {...publicPayload(result.combat,result.timeline,accessInfo.viewerSide),
       replayed:result.replayed,batches:result.batches};
   });
   return NextResponse.json(committed,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
   return error(e instanceof Error?e.message:"No se pudo ejecutar la orden V2.");
 }
}
