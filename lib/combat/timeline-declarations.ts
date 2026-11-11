/**
 * Encounter-local escrow for V2 commands. The caller places this object beside
 * the combat snapshot in the same locked CombatSession transaction.
 *
 * A declaration reserves PA/ticks but NEVER executes an attack, item,
 * spell, summon or movement at HTTP submission time. Only a completed batch
 * may enter the trusted resolver. This is a pure orchestration module, not a
 * replacement for route-level permission, ownership, skill approval, range,
 * mana, inventory and geometry validation.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import {
  compileCombatTimelineIntent,newTimelineForCombat,
  type CompilationContext,type TimelineCombatCommand,
} from "./combat-timeline-adapter.ts";
import {
  completeNextTimelineBatch,pendingTimelineSides,queueTimelineAction,
  timelineRoundOf,type ContinuousCombatTimeline,type TimelineBatch,type TimelineEvent,
} from "./action-timeline.ts";
import {
  resolveAuthorizedTimelineBatch,
  type AuthorizedTimelineEffect,
} from "./timeline-batch-resolver.ts";

export type TimelineDeclaration={
  id:string;owner:Side;command:TimelineCombatCommand;
  /** Stored on the server only: never reveal enemy positions or hidden aim. */
  signature:string;
};

export type TimelineDeclarationSession={
  version:2;
  clock:ContinuousCombatTimeline;
  declarations:Record<string,TimelineDeclaration>;
  /** Replay receipts outlive pruned event bodies. */
  receipts:Record<string,{owner:Side;signature:string}>;
};

export type PreparedTimelineCommit={
  batch:TimelineBatch;
  declarations:TimelineDeclaration[];
};

const stableJson=(value:unknown):string=>{
  if(value===null||typeof value!=="object")return JSON.stringify(value)??"null";
  if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";
  return "{"+Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>JSON.stringify(k)+":"+stableJson(v)).join(",")+"}";
};
const validSide=(side:Side)=>side==="PLAYER"||side==="NPC";

export function newTimelineDeclarationSession(snapshot:CombatState):TimelineDeclarationSession{
 return {version:2,clock:newTimelineForCombat(snapshot),declarations:{},receipts:{}};
}

/** A locked server route must supply a unique event ID (normally derived
 * from the authenticated actor and idempotent request ID). Retrying the same
 * ID with identical command is a no-op; reusing it with different input is
 * rejected before spending any PA.
 */
export function declareTimelineCommand(
 original:TimelineDeclarationSession,snapshot:CombatState,owner:Side,
 command:TimelineCombatCommand,eventId:string,context:CompilationContext={},
):TimelineDeclarationSession {
 if(original.version!==2||snapshot.status!=="ACTIVE"||!validSide(owner))
   throw new Error("El encuentro temporal no admite esa declaración.");
 const signature=stableJson({owner,command});
 if(signature.length>30_000)throw new Error("Orden temporal demasiado grande.");
 const previous=original.receipts[eventId];
 if(previous){
   if(previous.owner!==owner||previous.signature!==signature)
     throw new Error("Se reutilizó un identificador con una acción diferente.");
   return original;
 }
 if(Object.keys(original.receipts).length>=20_000)
   throw new Error("El encuentro alcanzó el límite de órdenes temporales.");
 // Only a fully approved intent is allowed into the clock. This compile
 // also rejects forged PA/tick durations and unauthorized skill plans.
 const intent=compileCombatTimelineIntent(snapshot,original.clock,owner,
   command,eventId,context);
 const clock=queueTimelineAction(original.clock,owner,intent);
 const next=structuredClone(original);
 next.clock=clock;
 next.declarations[eventId]={id:eventId,owner,command:structuredClone(command),signature};
 next.receipts[eventId]={owner,signature};
 return next;
}

/** Return null while any required actor has not declared its next action.
 * Existing long-running actions remain queued while the faster actor chooses.
 * Never fast-forward to a hit merely because one HTTP request arrived first.
 */
export function prepareTimelineCommit(
 session:TimelineDeclarationSession,
):PreparedTimelineCommit|null {
 if(session.version!==2)throw new Error("Estado de declaraciones inválido.");
 if(pendingTimelineSides(session.clock).length)return null;
 const batch=completeNextTimelineBatch(session.clock);
 const declarations=batch.events.map(event=>{
   const declaration=session.declarations[event.id];
   if(!declaration||declaration.owner!==event.owner)
     throw new Error("El evento carece de su intención autorizada.");
   return declaration;
 });
 return {batch,declarations};
}

/** A commit only retires exactly the next scheduled batch; it can never skip
 * an event or apply a stale prepared bundle. Call this after all authorized
 * effects have been calculated, within the SAME serialized DB transaction.
 */
export function finalizeTimelineCommit(
 original:TimelineDeclarationSession,prepared:PreparedTimelineCommit,
):TimelineDeclarationSession {
 const expected=prepareTimelineCommit(original);
 if(!expected||expected.batch.atTick!==prepared.batch.atTick||
   expected.batch.events.length!==prepared.batch.events.length||
   expected.batch.events.some((event,i)=>
     event.id!==prepared.batch.events[i]?.id||
     event.sequence!==prepared.batch.events[i]?.sequence))
   throw new Error("El lote temporal cambió antes de confirmar sus resultados.");
 const next=structuredClone(original);
 next.clock=expected.batch.state;
 for(const event of expected.batch.events)delete next.declarations[event.id];
 return next;
}

export type TimelineSessionStatus={
  tick:number;round:number;waitingFor:Side[];
  running:Array<{owner:Side;kind:TimelineEvent["kind"];
    startsAtTick:number;endsAtTick:number}>;
};

/** Public HUD status contains time and telegraph KIND only, never the
 * uncommitted trajectory, hidden area/aim, target copy or command payload.
 */
export function publicTimelineSessionStatus(
 session:TimelineDeclarationSession,
):TimelineSessionStatus {
 return {
   tick:session.clock.nowTick,round:timelineRoundOf(session.clock.nowTick),
   waitingFor:pendingTimelineSides(session.clock),
   running:session.clock.events.filter(e=>e.status==="QUEUED").map(e=>({
     owner:e.owner,kind:e.kind,startsAtTick:e.startsAtTick,endsAtTick:e.endsAtTick,
   })),
 };
}

export type TrustedDeclaredTimelineResolver=(
 snapshot:Readonly<CombatState>,
 declaration:Readonly<TimelineDeclaration>,
 event:Readonly<TimelineEvent>,
 batch:Readonly<TimelineBatch>,
)=>AuthorizedTimelineEffect|Promise<AuthorizedTimelineEffect>;

/** Combines escrow and atomic HP/equipment resolution. The returned combat
 * and timeline must be persisted TOGETHER; neither one alone is a valid save.
 * A future route supplies a trusted resolver covering all approved skill
 * effects, movement, summons and interruptions before enabling this engine.
 */
export async function resolveDeclaredTimelineBatch(
 combat:CombatState,session:TimelineDeclarationSession,
 trustedResolve:TrustedDeclaredTimelineResolver,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession}|null>{
 const prepared=prepareTimelineCommit(session);
 if(!prepared)return null;
 const byId=new Map(prepared.declarations.map(entry=>[entry.id,entry]));
 const updated=await resolveAuthorizedTimelineBatch(combat,prepared.batch,
   (snapshot,event,batch)=>{
     const declaration=byId.get(event.id);
     if(!declaration)throw new Error("Intención ausente al resolver un impacto.");
     return trustedResolve(snapshot,declaration,event,batch);
   });
 const timeline=finalizeTimelineCommit(session,prepared);
 return {combat:updated,timeline};
}
