/**
 * Two independently authenticated owners commit their own V2 intents.
 * The server never invents a rival's orders or advances a player's
 * unfinished action merely because the opponent sent a request.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import {pendingTimelineSides} from "./action-timeline.ts";
import {declareTimelineCommand,publicTimelineSessionStatus,
  type TimelineDeclarationSession} from "./timeline-declarations.ts";
import type {TimelineCombatCommand,CompilationContext}
 from "./combat-timeline-adapter.ts";
import {parseExperimentalV2Command} from "./timeline-experiment.ts";
import {resolveBasicTimelineWindow,type TimelineDice}
 from "./timeline-basic-actions.ts";

export function publicPvPTimelineStatus(
 session:TimelineDeclarationSession,viewer:Side|null,
){
 const status=publicTimelineSessionStatus(session);
 const missing=pendingTimelineSides(session.clock);
 // Do not expose a freshly declared opponent's action, deadline, AP cost
 // or private trajectory before the viewer also commits a choice.
 const hidden=session.clock.events.filter(event=>
   event.status==="QUEUED"&&event.startsAtTick>=session.clock.nowTick&&
   (viewer===null||event.owner!==viewer)&&
   (viewer===null||missing.includes(viewer)));
 const hiddenIds=new Set(hidden.map(e=>e.id));
 const running=session.clock.events.filter(e=>e.status==="QUEUED").map(e=>
   hiddenIds.has(e.id)?{
     owner:e.owner,kind:"RESERVED",
     startsAtTick:session.clock.nowTick,
     endsAtTick:session.clock.nowTick,
   }:{
     owner:e.owner,kind:e.kind,
     startsAtTick:e.startsAtTick,endsAtTick:e.endsAtTick,
   });
 const pa={PLAYER:{...status.pa.PLAYER},NPC:{...status.pa.NPC}};
 for(const event of hidden){
   const side=event.owner;
   pa[side].used=Math.max(0,pa[side].used-event.paidAp);
 }
 return {...status,running,pa};
}

export async function advancePvPTimeline(
 original:CombatState,originalSession:TimelineDeclarationSession,
 makeDice:()=>TimelineDice,
 onCommittedBatch?:(before:CombatState,after:CombatState)=>Promise<void>,
 maxBatches=24,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;batches:number}>{
 if(!Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>32)
   throw new Error("Límite de acciones simultáneas inválido.");
 let combat=original,timeline=originalSession,steps=0;
 while(steps<maxBatches&&combat.status==="ACTIVE"){
   const missing=pendingTimelineSides(timeline.clock);
   // The last projectile keeps the encounter alive after its shooter falls.
   // Missing declarations from DEAD actors are automatic free WAITs; a living
   // participant must still choose whether to dodge, block or move.
   if(missing.some(side=>combat.actors[side].hp>0)||(
     missing.length>0&&!(combat.timelineProjectiles?.length)))break;
   const next=await resolveBasicTimelineWindow(combat,timeline,makeDice);
   if(!next)break;
   await onCommittedBatch?.(combat,next.combat);
   combat=next.combat;timeline=next.timeline;steps++;
 }
 return {combat,timeline,batches:steps};
}

/** Idempotence is scoped to the trusted owner; the request body contains no
 * side parameter. The route MUST derive owner from its locked Character row.
 */
export async function submitPvPTimelineCommand(
 combat:CombatState,session:TimelineDeclarationSession,owner:Side,
 raw:unknown,requestId:string,makeDice:()=>TimelineDice,
 context:CompilationContext={},
 onCommittedBatch?:(before:CombatState,after:CombatState)=>Promise<void>,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;
 replayed:boolean;batches:number}>{
 if(combat.actors.NPC.characterId===null||!["PLAYER","NPC"].includes(owner))
   throw new Error("El encuentro no es un PvP V2.");
 if(!/^[a-zA-Z0-9_-]{12,72}$/.test(requestId))
   throw new Error("Identificador PvP inválido.");
 const command:TimelineCombatCommand=parseExperimentalV2Command(raw);
 const id="V2_"+owner+":"+requestId;
 const replay=Object.hasOwn(session.receipts,id);
 const declared=declareTimelineCommand(session,combat,owner,command,id,context);
 if(replay)return {combat,timeline:session,replayed:true,batches:0};
 const advanced=await advancePvPTimeline(combat,declared,
   makeDice,onCommittedBatch);
 return {...advanced,replayed:false};
}
