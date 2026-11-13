/**
 * Narrow V2 experiment for new training encounters. Never writes real HP,
 * inventory or skill-resource tables. The API supplies server dice and
 * serializes the combat snapshot and declaration escrow in one DB row.
 */
import {fieldDistance} from "./field-plane.ts";
import {type CombatState} from "./turn-engine.ts";
import {pendingTimelineSides,timelineRoundOf} from "./action-timeline.ts";
import {assertBasicTimelineEligible,resolveBasicTimelineWindow,
  type TimelineDice} from "./timeline-basic-actions.ts";
import {declareTimelineCommand,newTimelineDeclarationSession,
  type TimelineDeclarationSession} from "./timeline-declarations.ts";
import type {TimelineCombatCommand,CompilationContext} from "./combat-timeline-adapter.ts";

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
 case "USE_ITEM":{
   if(!keys(raw,["kind","itemId","characterItemId","requestId"])||
      !Number.isSafeInteger(raw.itemId)||Number(raw.itemId)<1||
      !Number.isSafeInteger(raw.characterItemId)||
      Number(raw.characterItemId)<1||
      typeof raw.requestId!=="string"||
      !/^[a-zA-Z0-9:_-]{12,100}$/.test(raw.requestId))
     return wrong();
   return raw as TimelineCombatCommand;
 }
 case "COMMAND_SUMMON":{
   const id=raw.summonId;
   if(!keys(raw,["kind","summonId","order","targetId","newBehavior",
      "planarMove"])||
      typeof id!=="string"||id.length<1||id.length>160||
      !["CHANGE_BEHAVIOR","CHANGE_TARGET","MOVE"].includes(String(raw.order))||
      raw.order==="CHANGE_BEHAVIOR"&&
        (!["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"]
          .includes(String(raw.newBehavior))||
         raw.targetId!==undefined||raw.planarMove!==undefined)||
      raw.order==="CHANGE_TARGET"&&
        (typeof raw.targetId!=="string"||
         !/^(FIGHTER:(PLAYER|NPC)|SUMMON:[a-zA-Z0-9:_-]{1,150})$/.test(raw.targetId)||
         raw.newBehavior!==undefined||raw.planarMove!==undefined)||
      raw.order==="MOVE"&&
        (raw.newBehavior!==undefined||raw.targetId!==undefined||
         !object(raw.planarMove)||
         !keys(raw.planarMove,["x","y"])||
         typeof raw.planarMove.x!=="number"||
         typeof raw.planarMove.y!=="number"||
         !Number.isFinite(raw.planarMove.x)||
         !Number.isFinite(raw.planarMove.y)||
         Math.hypot(raw.planarMove.x,raw.planarMove.y)<.01||
         Math.hypot(raw.planarMove.x,raw.planarMove.y)>1.000001))
       return wrong();
   return raw as TimelineCombatCommand;
 }
 case "CAST_SKILL":{
   // The caller supplies only a reference and aiming geometry.
   // The trusted server must compile the entire approved plan.
   const sid=raw.skillId,requestId=raw.requestId;
   const p=raw.planarMove;
   if(!keys(raw,["kind","skillId","requestId","attackSource",
     "trajectory","areaCenter","areaAngleDegrees","planarMove",
     "movementOrder","constructionFieldPoint","constructionForm",
     "constructionHeightMeters","constructionFootprintRadiusMeters",
     "constructionSolidHeightMeters","constructionLabel"])||
     !Number.isSafeInteger(sid)||Number(sid)<1||
     typeof requestId!=="string"||
     !/^[a-zA-Z0-9:_-]{12,100}$/.test(requestId)||
     raw.attackSource!==undefined&&
       !["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"]
         .includes(String(raw.attackSource))||
     raw.areaCenter!==undefined&&!position(raw.areaCenter)||
     raw.constructionFieldPoint!==undefined&&
       !position(raw.constructionFieldPoint)||
     raw.constructionForm!==undefined&&
       !["FIELD","BLOCK","DECOR"].includes(String(raw.constructionForm))||
     raw.constructionLabel!==undefined&&
       (typeof raw.constructionLabel!=="string"||
        raw.constructionLabel.length>80)||
     ["constructionHeightMeters","constructionFootprintRadiusMeters",
      "constructionSolidHeightMeters"].some(k=>
       raw[k]!==undefined&&
       (typeof raw[k]!=="number"||!Number.isFinite(raw[k])||
        raw[k]<0||raw[k]>10))||
     raw.areaAngleDegrees!==undefined&&
       (typeof raw.areaAngleDegrees!=="number"||
        !Number.isFinite(raw.areaAngleDegrees)||
        raw.areaAngleDegrees<0||raw.areaAngleDegrees>=360)||
     raw.trajectory!==undefined&&
       (!Array.isArray(raw.trajectory)||raw.trajectory.length<2||
        raw.trajectory.length>16||!raw.trajectory.every(position))||
     (p===undefined)!==(raw.movementOrder===undefined)||
     raw.movementOrder!==undefined&&
       !["BEFORE","AFTER"].includes(String(raw.movementOrder))||
     p!==undefined&&(!object(p)||!keys(p,["x","y"])||
       typeof p.x!=="number"||typeof p.y!=="number"||
       !Number.isFinite(p.x)||!Number.isFinite(p.y)||
       Math.hypot(p.x,p.y)<.01||Math.hypot(p.x,p.y)>1.000001))
     return wrong();
   return raw as TimelineCombatCommand;
 }
 case "ATTACK":{
   const types=["CUT","BLUNT","PIERCE"],sources=[
     "MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"];
   const heights=raw.projectileHeights;
   if(!keys(raw,["kind","attackType","attackSource","usesMagic","trajectory",
      "areaCenter","rangedPhysical","throwWeapon","projectileHeights",
      "planarMove","movementOrder"])||
     !types.includes(String(raw.attackType))||
     raw.attackSource!==undefined&&!sources.includes(String(raw.attackSource))||
     raw.usesMagic!==undefined&&typeof raw.usesMagic!=="boolean"||
     raw.rangedPhysical!==undefined&&typeof raw.rangedPhysical!=="boolean"||
     raw.throwWeapon!==undefined&&typeof raw.throwWeapon!=="boolean"||
     raw.areaCenter!==undefined&&!position(raw.areaCenter)||
     // Only two approved movement orders are legal, with a real
     // 0.01–1 m vector. A projectile cannot receive a free movement
     // by smuggling composite metadata into its launch declaration.
     (raw.planarMove===undefined)!==(raw.movementOrder===undefined)||
     raw.movementOrder!==undefined&&
       !["BEFORE","AFTER"].includes(String(raw.movementOrder))||
     raw.planarMove!==undefined&&
       (!object(raw.planarMove)||!keys(raw.planarMove,["x","y"])||
        typeof raw.planarMove.x!=="number"||
        typeof raw.planarMove.y!=="number"||
        !Number.isFinite(raw.planarMove.x)||
        !Number.isFinite(raw.planarMove.y)||
        Math.hypot(raw.planarMove.x,raw.planarMove.y)<.01||
        Math.hypot(raw.planarMove.x,raw.planarMove.y)>1.000001||
        raw.throwWeapon===true||raw.rangedPhysical===true)||

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
 if(npc.hp<=0||state.actors.PLAYER.hp<=0)return {kind:"WAIT"};
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
 snapshot:CombatState,options:{pvp?:boolean}={},
):{combat:CombatState;timeline:TimelineDeclarationSession}{
 assertBasicTimelineEligible(snapshot);
 if(snapshot.tick!==0||snapshot.pending||
    (snapshot.actors.NPC.characterId!==null)!==Boolean(options.pvp))
   throw new Error(options.pvp?
     "V2 experimental PvP requiere dos personajes nuevos y reales.":
     "V2 experimental solo acepta un entrenamiento nuevo; PvP requiere activación explícita.");
 const combat=structuredClone(snapshot);
 combat.timelineMode="SHARED";
 const empty=newTimelineDeclarationSession(combat);
 // PvP NEVER reserves a fabricated NPC action; both users choose separately.
 return {combat,timeline:options.pvp?empty:
   reserveNextTrainingNpcIntent(combat,empty)};
}

/**
 * Publish only the telegraphed KIND and deadlines through the existing public
 * clock. The NPC's exact trajectory stays in its server-side declaration.
 *
 * Pre-reserving the NPC BEFORE asking the player allows a genuinely informed
 * reaction choice at tick zero and after each batch. It does NOT resolve an
 * impact or charge a player reaction; player still gets their own action slot.
 */
export function reserveNextTrainingNpcIntent(
 combat:CombatState,original:TimelineDeclarationSession,
):TimelineDeclarationSession{
 if(combat.status!=="ACTIVE"||
   !pendingTimelineSides(original.clock).includes("NPC"))return original;
 const actor=original.clock.actors.NPC;
 const at=Math.max(original.clock.nowTick,actor.availableAtTick);
 const currentRound=String(timelineRoundOf(at));
 const spent=actor.spentApByRound[currentRound]??0;
 const command=spent>=actor.apLimitPerRound
   ?{kind:"WAIT" as const}:experimentalTrainingNpcCommand(combat);
 return declareTimelineCommand(original,combat,"NPC",command,
   "NPC_AUTO:"+original.clock.nextSequence);
}

/** Drive independent NPC actions while a player command is in progress.
 * Stop when player input is needed. Server bounds protect DB transactions
 * from expensive automated loops, and PA reservations are never fabricated.
 */
export async function advanceExperimentalTimeline(
 original:CombatState,session:TimelineDeclarationSession,
 makeDice:()=>TimelineDice,maxBatches=20,
 onCommittedBatch?:(before:CombatState,after:CombatState)=>Promise<void>,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;batches:number}>{
 let combat=original,timeline=session,steps=0;
 if(!Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>32)
   throw new Error("Límite de avances experimentales inválido.");
 while(steps<maxBatches&&combat.status==="ACTIVE"){
   timeline=reserveNextTrainingNpcIntent(combat,timeline);
   const missing=pendingTimelineSides(timeline.clock);
   if(missing.includes("PLAYER")&&combat.actors.PLAYER.hp>0)break;
   const resolved=await resolveBasicTimelineWindow(combat,timeline,makeDice);
   if(!resolved)break;
   // The authoritative state transition is durable only after inventory
   // side-effects are committed in the same transaction, per world batch.
   await onCommittedBatch?.(combat,resolved.combat);
   combat=resolved.combat;
   timeline=resolved.timeline;
   steps++;
 }
 // At the moment player control returns, the next NPC intention should
 // already be visible. Otherwise the player cannot react to a warned strike.
 timeline=reserveNextTrainingNpcIntent(combat,timeline);
 return {combat,timeline,batches:steps};
}

/** True retry: verify stored command receipt and do not advance time again. */
export async function submitExperimentalTimelineCommand(
 combat:CombatState,session:TimelineDeclarationSession,
 raw:unknown,requestId:string,makeDice:()=>TimelineDice,
 context:CompilationContext={},
 onCommittedBatch?:(before:CombatState,after:CombatState)=>Promise<void>,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;
 replayed:boolean;batches:number}>{
 if(!/^[a-zA-Z0-9_-]{12,72}$/.test(requestId))
   throw new Error("Identificador de acción inválido; se requiere una clave estable.");
 const command=parseExperimentalV2Command(raw);
 const id="V2_PLAYER:"+requestId;
 const hadReceipt=Object.hasOwn(session.receipts,id);
 const declared=declareTimelineCommand(session,combat,"PLAYER",command,id,context);
 if(hadReceipt)return {combat,timeline:session,replayed:true,batches:0};
 const advanced=await advanceExperimentalTimeline(combat,declared,makeDice,
   20,onCommittedBatch);
 return {...advanced,replayed:false};
}
