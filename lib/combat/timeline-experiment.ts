/**
 * Narrow V2 experiment for new training encounters. Never writes real HP,
 * inventory or skill-resource tables. The API supplies server dice and
 * serializes the combat snapshot and declaration escrow in one DB row.
 */
import {fieldDistance} from "./field-plane.ts";
import {type CombatState} from "./turn-engine.ts";
import {pendingTimelineSides} from "./action-timeline.ts";
import {assertBasicTimelineEligible,resolveBasicTimelineWindow,
  type TimelineDice} from "./timeline-basic-actions.ts";
import {declareTimelineCommand,newTimelineDeclarationSession,
  type TimelineDeclarationSession} from "./timeline-declarations.ts";
import type {TimelineCombatCommand} from "./combat-timeline-adapter.ts";

const object=(o:unknown):o is Record<string,unknown>=>
  !!o&&typeof o==="object"&&!Array.isArray(o);
const keys=(o:Record<string,unknown>,allowed:string[])=>
  Object.keys(o).every(key=>allowed.includes(key));
const position=(p:unknown):p is {x:number;y:number}=>
  object(p)&&typeof p.x==="number"&&typeof p.y==="number"&&
  Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&
  p.y>=0&&p.y<=1;
const wrong=():never=>{throw new Error("Orden no disponible en el laboratorio V2.");};

/** No arbitrary skills, modules, effects, target ids, PA or ticks in commands. */
export function parseExperimentalV2Command(raw:unknown):TimelineCombatCommand{
 if(!object(raw)||typeof raw.kind!=="string")return wrong();
 switch(raw.kind){
 case "WAIT":
   if(!keys(raw,["kind"]))return wrong();
   return {kind:"WAIT"};
 case "MOVE":
   if(!keys(raw,["kind","meters","direction","weaponSlot"])||
     typeof raw.meters!=="number"||!Number.isFinite(raw.meters)||
     raw.meters<=0||raw.meters>20||
     !["TOWARD","AWAY","WEAPON"].includes(String(raw.direction))||
     raw.weaponSlot!==undefined&&
       !["MAIN_HAND","OFF_HAND"].includes(String(raw.weaponSlot)))
     return wrong();
   return raw as TimelineCombatCommand;
 case "GUARD":
   if(!keys(raw,["kind","weaponSlot"])||
      !["MAIN_HAND","OFF_HAND"].includes(String(raw.weaponSlot)))
     return wrong();
   return raw as TimelineCombatCommand;
 case "PREPARE_REACTION":
   if(!keys(raw,["kind","defense","defenseAngle","predictedCenter",
     "dodgeDirection","counterMagic"])||
     !["DODGE","ENDURE","REPEL","DEFLECT","MAGIC_FIELD","COUNTER"].includes(String(raw.defense))||
     raw.predictedCenter!==undefined&&!position(raw.predictedCenter)||
     raw.defenseAngle!==undefined&&
       (typeof raw.defenseAngle!=="number"||!Number.isFinite(raw.defenseAngle))||
     raw.counterMagic!==undefined&&typeof raw.counterMagic!=="boolean"||
     raw.dodgeDirection!==undefined&&
       !["TOWARD","AWAY"].includes(String(raw.dodgeDirection)))
     return wrong();
   return raw as TimelineCombatCommand;
 case "ATTACK":{
   const types=["CUT","BLUNT","PIERCE"],sources=[
     "MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"];
   const heights=raw.projectileHeights;
   if(!keys(raw,["kind","attackType","attackSource","usesMagic","trajectory",
      "areaCenter","rangedPhysical","throwWeapon","projectileHeights"])||
     !types.includes(String(raw.attackType))||
     raw.attackSource!==undefined&&!sources.includes(String(raw.attackSource))||
     raw.usesMagic!==undefined&&typeof raw.usesMagic!=="boolean"||
     raw.rangedPhysical!==undefined&&typeof raw.rangedPhysical!=="boolean"||
     raw.throwWeapon!==undefined&&typeof raw.throwWeapon!=="boolean"||
     raw.areaCenter!==undefined&&!position(raw.areaCenter)||
     raw.trajectory!==undefined&&
       (!Array.isArray(raw.trajectory)||raw.trajectory.length<2||
        raw.trajectory.length>16||!raw.trajectory.every(position))||
     heights!==undefined&&
       (!object(heights)||!keys(heights,["launchMeters","impactMeters","arcRiseMeters"])||
        typeof heights.launchMeters!=="number"||
        typeof heights.impactMeters!=="number"||
        !Number.isFinite(heights.launchMeters)||
        !Number.isFinite(heights.impactMeters)||
        heights.arcRiseMeters!==undefined&&
          (typeof heights.arcRiseMeters!=="number"||
           !Number.isFinite(heights.arcRiseMeters))))
     return wrong();
   return raw as TimelineCombatCommand;
 }
 default:return wrong();
 }
}

/** NPC choices are always server-generated, with no player-supplied commands. */
export function experimentalTrainingNpcCommand(state:CombatState):TimelineCombatCommand{
 const npc=state.actors.NPC;
 if(npc.hp<=0)return {kind:"WAIT"};
 const distance=fieldDistance(npc,state.actors.PLAYER);
 if(distance>.65){
   const maxMeters=Math.max(1,Math.round(npc.race/10));
   return {kind:"MOVE",direction:"TOWARD",
     meters:Math.min(maxMeters,Math.max(.1,distance-.5))};
 }
 return {kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
}

export function newExperimentalTimeline(
 snapshot:CombatState,
):{combat:CombatState;timeline:TimelineDeclarationSession}{
 assertBasicTimelineEligible(snapshot);
 if(snapshot.tick!==0||snapshot.pending||
   snapshot.actors.NPC.characterId!==null)
   throw new Error("V2 experimental solo acepta un entrenamiento nuevo.");
 const combat=structuredClone(snapshot);
 combat.timelineMode="SHARED";
 return {combat,timeline:newTimelineDeclarationSession(combat)};
}

/** Drive independent NPC actions while a player command is in progress.
 * Stop when player input is needed. Server bounds protect DB transactions
 * from expensive automated loops, and PA reservations are never fabricated.
 */
export async function advanceExperimentalTimeline(
 original:CombatState,session:TimelineDeclarationSession,
 makeDice:()=>TimelineDice,maxBatches=20,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;batches:number}>{
 let combat=original,timeline=session,steps=0;
 if(!Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>32)
   throw new Error("Límite de avances experimentales inválido.");
 while(steps<maxBatches&&combat.status==="ACTIVE"){
   const missing=pendingTimelineSides(timeline.clock);
   if(missing.includes("PLAYER")&&combat.actors.PLAYER.hp>0)break;
   if(missing.includes("NPC")){
     const cmd=experimentalTrainingNpcCommand(combat);
     timeline=declareTimelineCommand(timeline,combat,"NPC",cmd,
       "NPC_AUTO:"+timeline.clock.nextSequence);
   }
   const resolved=await resolveBasicTimelineWindow(combat,timeline,makeDice);
   if(!resolved)break;
   combat=resolved.combat;
   timeline=resolved.timeline;
   steps++;
 }
 return {combat,timeline,batches:steps};
}

/** True retry: verify stored command receipt and do not advance time again. */
export async function submitExperimentalTimelineCommand(
 combat:CombatState,session:TimelineDeclarationSession,
 raw:unknown,requestId:string,makeDice:()=>TimelineDice,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;
 replayed:boolean;batches:number}>{
 if(!/^[a-zA-Z0-9_-]{12,72}$/.test(requestId))
   throw new Error("Identificador de acción inválido; se requiere una clave estable.");
 const command=parseExperimentalV2Command(raw);
 const id="V2_PLAYER:"+requestId;
 const hadReceipt=Object.hasOwn(session.receipts,id);
 const declared=declareTimelineCommand(session,combat,"PLAYER",command,id);
 if(hadReceipt)return {combat,timeline:session,replayed:true,batches:0};
 const advanced=await advanceExperimentalTimeline(combat,declared,makeDice);
 return {...advanced,replayed:false};
}
