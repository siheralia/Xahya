/**
 * Basic V2 action resolver for safe, completed MOVE / WAIT / GUARD.
 *
 * Position changes come from the existing movement implementation in an
 * isolated V1 shadow (thus preserving Xahya's actual range and obstacles).
 * Costs, deadlines and opponent concurrency come ONLY from the V2 scheduler.
 * Commands never cause changes when first declared.
 *
 * This module also wires physical punches with the V2 simultaneous commit.
 * It is a PURE integration test target; the live API must still authorize
 * every action, lock the session and persist both objects together.
 */
import {applyCombatCommand,turnTicks,type CombatCommand,type CombatState,
  type Side} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {offhandArmorShield} from "../items/combat-wearables.ts";
import {type ContinuousCombatTimeline,type TimelineEvent} from "./action-timeline.ts";
import {type AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import {simulateBasicPhysicalTimelineHit} from "./timeline-basic-strike.ts";
import {simulateBasicMagicTimelineHit} from "./timeline-basic-magic.ts";
import {simulateApprovedTimelineSupport} from "./timeline-basic-support.ts";
import {resolveDeclaredTimelineBatch,
  type TimelineDeclarationSession} from "./timeline-declarations.ts";
import type {TimelineCombatCommand} from "./combat-timeline-adapter.ts";

type Move=Extract<CombatCommand,{kind:"MOVE"}>;
type Guard=Extract<TimelineCombatCommand,{kind:"GUARD"}>;
export type TimelineDice={hit:number;critical:number;defense:number};

const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";

/** Timed passives and upkeep need explicit tick-by-tick scheduling before
 * they can run in the basic sandbox, especially when an action crosses 100.
 */
export function assertBasicTimelineEligible(combat:CombatState):void{
 if(combat.status!=="ACTIVE"||combat.pending||
   (combat.constructions?.length??0)>0||(combat.summons?.length??0)>0||
   (combat.summonStatuses??[]).some(status=>
     !status.id.startsWith("V2_SUPPORT:")||status.by!==status.target)||
   (combat.droppedWeapons?.length??0)>0||
   Object.values(combat.microEffects?.definitions??{}).some(x=>x?.length)||
   Object.values(combat.karmaBoosts??{}).some(x=>Object.keys(x??{}).length>0)||
   combat.actors.PLAYER.equipmentDerivedReplay||
   combat.actors.NPC.equipmentDerivedReplay||
   (["PLAYER","NPC"] as const).some(side=>{
     const fighter=combat.actors[side];
     return [fighter.equippedWeapon,fighter.offhandWeapon,
       ...(fighter.equippedWearables??[])].some(item=>item?.autoRepair);
   }))
   throw new Error("El encuentro requiere el resolutor temporal completo de efectos.");
}

function shadowForBasicMove(combat:CombatState,owner:Side):CombatState{
 const shadow=structuredClone(combat);
 shadow.round=1;shadow.tick=0;shadow.pending=null;
 shadow.timelineMode=undefined;shadow.tieOpener=owner;
 shadow.log=[];shadow.narrativeHistory=[];
 shadow.activeBlocks={};shadow.mirrorRayQueue=[];
 for(const side of ["PLAYER","NPC"] as const){
   shadow.actors[side].spentTicks=0;
   shadow.actors[side].spentAp=0;
 }
 return shadow;
}
function validateSimpleEvent(clock:ContinuousCombatTimeline,event:TimelineEvent):void{
 if(clock.version!==2||event.status!=="RESOLVED"||
   clock.nowTick!==event.endsAtTick)
   throw new Error("La acción básica aún no termina en la línea de tiempo.");
}

/** A MOVE uses the real terrain/range rules, but commits its world delta
 * only at the clock's deadline. The legacy spentTicks/spentAp are discarded.
 */
export function simulateBasicTimelineMove(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,command:Move,
):AuthorizedTimelineEffect {
 validateSimpleEvent(clock,event);
 assertBasicTimelineEligible(combat);
 if(event.kind!=="MOVE"||command.kind!=="MOVE"||
   event.durationTicks!==turnTicks(combat.actors[event.owner])||event.paidAp!==1)
   throw new Error("El movimiento no coincide con su reserva temporal.");
 if((command.direction??"TOWARD")==="WEAPON")
   throw new Error("Recuperar armas arrojadas requiere el resolutor temporal de inventario.");
 const from=fieldPosition(combat.actors[event.owner]);
 const moved=applyCombatCommand(shadowForBasicMove(combat,event.owner),
   event.owner,structuredClone(command));
 const to=fieldPosition(moved.actors[event.owner]);
 if(moved.actors[event.owner].hp!==combat.actors[event.owner].hp||
   moved.actors[other(event.owner)].hp!==combat.actors[other(event.owner)].hp||
   JSON.stringify(moved.droppedWeapons??[])!==JSON.stringify(combat.droppedWeapons??[]))
   throw new Error("El movimiento contiene efectos secundarios no permitidos.");
 const delta={x:to.x-from.x,y:to.y-from.y};
 return {
   eventId:event.id,
   positionDelta:{[event.owner]:delta},
   ...(delta.x!==0||delta.y!==0?{resetPhysicalStrokes:[event.owner]}:{}),
   logs:moved.log.filter(entry=>entry.kind==="MOVE")
     .map(entry=>({...entry,tick:event.endsAtTick})),
 };
}

/** Waiting and maintaining guard do not run the legacy reactive defense:
 * a guard is an occupied interval, not a one-time response to a hit.
 */
export function simulateBasicTimelinePassiveAction(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:TimelineCombatCommand,
):AuthorizedTimelineEffect {
 validateSimpleEvent(clock,event);
 assertBasicTimelineEligible(combat);
 const fighter=combat.actors[event.owner];
 if(command.kind==="WAIT"&&event.kind==="WAIT"){
   if(event.paidAp!==0||
     event.durationTicks!==100-event.startsAtTick%100)
     throw new Error("La espera excede la siguiente frontera temporal.");
   return {eventId:event.id,logs:[{kind:"WAIT",tick:event.endsAtTick,
     by:event.owner,summary:fighter.name+" esperó hasta el tick "+event.endsAtTick}]};
 }
 if(command.kind==="GUARD"&&event.kind==="BLOCK"){
   if(event.paidAp!==1||
     event.durationTicks!==Math.max(10,turnTicks(fighter))||
     event.blockToolSlot!==command.weaponSlot)
     throw new Error("La guardia difiere de la reserva aprobada.");
   const item=command.weaponSlot==="MAIN_HAND"?fighter.equippedWeapon:
     fighter.offhandWeapon??offhandArmorShield(fighter.equippedWearables);
   if(!item||event.blockToolCopyId!==item.characterItemId)
     throw new Error("La guardia perdió su equipo original.");
   // Already broken armor may have worn out during this guard window.
   const shieldReady=(item.durability??fighter.weaponIntegrity)>0;
   return {eventId:event.id,logs:[{kind:"BLOCK",tick:event.endsAtTick,
     by:event.owner,weaponName:item.name,weaponIntegrity:item.durability,
     summary:shieldReady
       ?fighter.name+" mantuvo "+item.name+" en guardia hasta el tick "+event.endsAtTick
       :fighter.name+" terminó su guardia con "+item.name+" roto"}]};
 }
 throw new Error("Acción no admitida por el resolutor básico temporal.");
}

/** Controlled demonstration of a full action loop. All accepted effects
 * apply at action COMPLETION, not at submission, and are committed together.
 * The caller supplies independent server dice; no client probability accepted.
 */
export async function resolveBasicTimelineWindow(
 combat:CombatState,session:TimelineDeclarationSession,makeDice:()=>TimelineDice,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession}|null>{
 assertBasicTimelineEligible(combat);
 return resolveDeclaredTimelineBatch(combat,session,(snapshot,declaration,event,batch)=>{
   const state=snapshot as CombatState;
   const command=declaration.command;
   if(event.kind==="ATTACK"&&command.kind==="ATTACK"){
     const strike=makeDice(),defense=makeDice();
     return command.usesMagic
       ?simulateBasicMagicTimelineHit(state,batch.state,event,command,strike,defense)
       :simulateBasicPhysicalTimelineHit(state,batch.state,event,command,strike,defense);
   }
   if(event.kind==="SKILL"&&command.kind==="CAST_SKILL"){
     if(!declaration.approvedSkill)
       throw new Error("La habilidad no tiene un plan revisado en su declaración.");
     return simulateApprovedTimelineSupport(state,batch.state,event,
       command,declaration.approvedSkill);
   }
   if(event.kind==="MOVE"&&command.kind==="MOVE")
     return simulateBasicTimelineMove(state,batch.state,event,command);
   return simulateBasicTimelinePassiveAction(state,batch.state,event,command);
 });
}
