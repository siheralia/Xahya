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
import {applyCombatCommand,basicCounterAttack,turnTicks,type CombatCommand,type CombatState,
  type Side} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {offhandArmorShield} from "../items/combat-wearables.ts";
import {activeTimelineReactionAt,type ContinuousCombatTimeline,type TimelineEvent} from "./action-timeline.ts";
import {type AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import {simulateBasicPhysicalTimelineHit,activeBlockSlot}
 from "./timeline-basic-strike.ts";
import {simulateBasicMagicTimelineHit} from "./timeline-basic-magic.ts";
import {simulateApprovedTimelineSupport} from "./timeline-basic-support.ts";
import {simulateApprovedTimelineOffense} from "./timeline-offensive-skill.ts";
import {simulateBasicTimelineConsumable} from "./timeline-consumables.ts";
import {simulateApprovedTimelineConstruction}
 from "./timeline-construction-world.ts";
import {
 simulateApprovedTimelineSummon,simulateTimelineSummonOrder,
} from "./timeline-summon-world.ts";
import {
 preparedTimelineReactionAt,timelineDefenseForImpact,
} from "./timeline-defense.ts";
import {type TimelineDeclarationSession} from "./timeline-declarations.ts";
import {resolveWorldTimelineBatch} from "./timeline-world-batch.ts";
import {
 simulateAutonomousTimelineSummon,simulateAutonomousTimelineMirror,
} from "./timeline-autonomous-effects.ts";
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
   
   (combat.summonStatuses??[]).some(status=>
     !(status.id.startsWith("V2_SUPPORT:")&&status.by===status.target)&&
     !(status.id.startsWith("V2_HOSTILE:")&&status.by!==status.target)&&
     !status.id.startsWith("V2_SUMMON:"))||
   (combat.droppedWeapons?.length??0)>0||
   Object.values(combat.microEffects?.definitions??{}).some(x=>x?.length)||
   Object.values(combat.karmaBoosts??{}).some(x=>Object.keys(x??{}).length>0))
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
 if(command.kind==="PREPARE_REACTION"&&event.kind==="REACT"){
   const requiresTwoPa=command.defense==="DODGE"&&
     command.dodgeDirection!==undefined;
   if(event.paidAp!==(requiresTwoPa?2:1)||
     event.durationTicks!==turnTicks(fighter))
     throw new Error("La reacción no coincide con la duración temporal aprobada.");
   const defense=command.defense;
   if(!["DODGE","ENDURE","REPEL","DEFLECT","MAGIC_FIELD","COUNTER"].includes(defense))
     throw new Error("Reacción temporal no permitida.");
   if(defense==="MAGIC_FIELD"&&(combat.mana?.[event.owner]?.current??0)<1)
     throw new Error("No hay maná para mantener el campo mágico.");
   return {
     eventId:event.id,
     ...(defense==="MAGIC_FIELD"?{manaSpent:{[event.owner]:1}}:{}),
     logs:[{kind:"REACT",tick:event.endsAtTick,by:event.owner,
       manaCost:defense==="MAGIC_FIELD"?1:undefined,
       summary:fighter.name+" mantuvo una reacción de "+
         ({DODGE:"esquiva",ENDURE:"resistencia",REPEL:"repulsión",
           DEFLECT:"desvío",MAGIC_FIELD:"campo mágico",
           COUNTER:"contraataque preparado"} as const)[defense]+
         " hasta el tick "+event.endsAtTick}],
   };
 }
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
 const charged=new Set(session.chargedReactionIds??[]);
 const countered=new Set(session.usedCounterReactionIds??[]);
 const dodgedMovement=new Set(session.usedDodgeMovementIds??[]);
 const defend=(
   event:TimelineEvent,batchState:ContinuousCombatTimeline,
   incoming:{usesMagic:boolean;isArea:boolean;hybrid?:boolean},
   snapshot:CombatState,
 )=>{
   const rival=other(event.owner);
   const reaction=preparedTimelineReactionAt(batchState,rival,
     event.endsAtTick,(id,owner)=>{
       const saved=session.declarations[id];
       return saved?.owner===owner?saved.command:undefined;
     });
   let posture=timelineDefenseForImpact(reaction,incoming);
   const actualEvent=activeTimelineReactionAt(batchState,rival,event.endsAtTick);
   if(posture.defense==="COUNTER"){
     // An autonomous creature/mirror is not a legal V1 counter target.
     // One paid posture grants at most one retaliation, even against two
     // strikes arriving at the same tick or in separate world batches.
     const basic=basicCounterAttack(snapshot,rival,
       posture.counterMagic===true);
     if(!actualEvent||countered.has(actualEvent.id)||
        event.kind==="AUTO_SUMMON"||event.kind==="AUTO_MIRROR"||
        !basic||basic.attackSource&&
          ["MAIN_HAND","OFF_HAND"].includes(basic.attackSource)&&
          (snapshot.actors[rival].equippedWeapon?.durability===0||
           snapshot.actors[rival].offhandWeapon?.durability===0))
       posture={kind:"DEFEND",defense:"NONE"};
     else countered.add(actualEvent.id);
   }
   if(posture.defense==="DODGE"&&posture.dodgeDirection&&actualEvent){
     if(dodgedMovement.has(actualEvent.id)){
       posture={...posture,dodgeDirection:undefined};
     }else dodgedMovement.add(actualEvent.id);
   }
   return {posture,rival,fieldId:posture.defense==="MAGIC_FIELD"?
     actualEvent?.id:undefined};
 };
 const collect=(effect:AuthorizedTimelineEffect,
   defense:{rival:Side;fieldId:string|undefined}):AuthorizedTimelineEffect=>{
   if(defense.fieldId&&!charged.has(defense.fieldId)){
     const fee=(effect.manaSpent?.[defense.rival]??0)+1;
     charged.add(defense.fieldId);
     return {...effect,manaSpent:{...effect.manaSpent,
       [defense.rival]:fee}};
   }
   return effect;
 };
 const finish=await resolveWorldTimelineBatch(combat,session,
   (snapshot,declaration,event,batch)=>{
     const state=snapshot as CombatState;
     const command=declaration.command;
     if(event.kind==="ATTACK"&&command.kind==="ATTACK"){
       const strike=makeDice(),defense=makeDice();
       const reaction=defend(event,batch.state,{usesMagic:command.usesMagic===true,
         isArea:command.usesMagic===true},state);
       const effect=command.usesMagic
         ?simulateBasicMagicTimelineHit(state,batch.state,event,command,
             strike,defense,reaction.posture)
         :simulateBasicPhysicalTimelineHit(state,batch.state,event,command,
             strike,defense,reaction.posture);
       return collect(effect,reaction);
     }
     if(event.kind==="SKILL"&&command.kind==="CAST_SKILL"){
       const plan=declaration.approvedSkill;
       if(!plan)throw new Error("La habilidad no tiene un plan revisado en su declaración.");
       if(plan.category==="CONSTRUCTION"){
         const strike=makeDice(),defense=makeDice();
         const reaction=defend(event,batch.state,{usesMagic:Boolean(plan.mirror),isArea:false},state);
         const effect=simulateApprovedTimelineConstruction(state,batch.state,event,
           command,plan,strike,defense,reaction.posture);
         return collect(effect,reaction);
       }
       if(plan.category==="OFFENSE"){
         const strike=makeDice(),defense=makeDice();
         const reaction=defend(event,batch.state,{
           usesMagic:plan.usesMagic===true,
           hybrid:Boolean(plan.approvedHybridContact),
           isArea:Boolean(plan.attackArea),
         },state);
         const effect=simulateApprovedTimelineOffense(state,batch.state,event,
           command,plan,strike,defense,reaction.posture);
         return collect(effect,reaction);
       }
       return simulateApprovedTimelineSupport(state,batch.state,event,
         command,plan);
     }
     if(event.kind==="SUMMON"&&command.kind==="CAST_SKILL"){
       if(!declaration.approvedSkill)
         throw new Error("Invocación sin plan aprobado.");
       return simulateApprovedTimelineSummon(state,batch.state,event,command,
         declaration.approvedSkill);
     }
     if(event.kind==="SUMMON"&&command.kind==="COMMAND_SUMMON")
       return simulateTimelineSummonOrder(state,batch.state,event,command);
     if(event.kind==="MOVE"&&command.kind==="MOVE")
       return simulateBasicTimelineMove(state,batch.state,event,command);
     if(event.kind==="ITEM"&&command.kind==="USE_ITEM")
       return simulateBasicTimelineConsumable(state,batch.state,event,command);
     const passive=simulateBasicTimelinePassiveAction(state,batch.state,event,command);
     if(event.kind==="REACT"&&command.kind==="PREPARE_REACTION"&&
       command.defense==="MAGIC_FIELD"){
       if(charged.has(event.id)){
         return {...passive,manaSpent:undefined};
       }
       charged.add(event.id);
     }
     return passive;
   },(snapshot,event,batch)=>{
     const state=snapshot as CombatState;
     const dice=makeDice(),defenseDice=makeDice();
     if(event.kind==="AUTO_SUMMON"){
       const reaction=defend(event,batch.state,{usesMagic:false,isArea:false},state);
       const slot=activeBlockSlot(state,batch.state,other(event.owner),
         event.endsAtTick);
       const posture=slot?{kind:"DEFEND" as const,defense:"BLOCK" as const,
         weaponSlot:slot}:reaction.posture;
       const effect=simulateAutonomousTimelineSummon(state,batch.state,
         event,dice,defenseDice,posture);
       return collect(effect,reaction);
     }
     if(event.kind==="AUTO_MIRROR"){
       const reaction=defend(event,batch.state,{usesMagic:true,isArea:false},state);
       const effect=simulateAutonomousTimelineMirror(state,batch.state,event,
         dice,defenseDice,reaction.posture);
       // A magic field charges only if the mirror actually emitted a ray.
       const launched=effect.logs?.some(x=>x.kind==="ATTACK"&&x.mirrorShot);
       return collect(effect,launched?reaction:{...reaction,fieldId:undefined});
     }
     throw new Error("Acontecimiento autónomo desconocido.");
   });
 if(finish){
   finish.timeline.chargedReactionIds=[...charged];
   finish.timeline.usedCounterReactionIds=[...countered];
   finish.timeline.usedDodgeMovementIds=[...dodgedMovement];
 }
 return finish;
}
