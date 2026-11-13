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
import type {CombatSkillPlan} from "./skill-casting.ts";
import {
  compileCombatTimelineIntent,newTimelineForCombat,
  type CompilationContext,type TimelineCombatCommand,
} from "./combat-timeline-adapter.ts";
import {
  completeNextTimelineBatch,interruptTimelineAction,pendingTimelineSides,queueTimelineAction,
  timelineRoundOf,type ContinuousCombatTimeline,type TimelineBatch,type TimelineEvent,
} from "./action-timeline.ts";
import {
  resolveAuthorizedTimelineBatch,
  type AuthorizedTimelineEffect,
} from "./timeline-batch-resolver.ts";

export type TimelineDeclaration={
  id:string;owner:Side;command:TimelineCombatCommand;
  /** Frozen, server-compiled catalog plan at the time of declaration. */
  approvedSkill?:CombatSkillPlan;
  /** Stored on the server only: never reveal enemy positions or hidden aim. */
  signature:string;
};

export type TimelineDeclarationSession={
  version:2;
  clock:ContinuousCombatTimeline;
  declarations:Record<string,TimelineDeclaration>;
  /** Replay receipts outlive pruned event bodies. */
  receipts:Record<string,{owner:Side;signature:string}>;
  /** Once-per-posture spell-field mana receipts; persists between batches. */
  chargedReactionIds?:string[];
  usedCounterReactionIds?:string[];
  usedDodgeMovementIds?:string[];
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
 return {version:2,clock:newTimelineForCombat(snapshot),declarations:{},receipts:{},
   chargedReactionIds:[],usedCounterReactionIds:[],usedDodgeMovementIds:[]};
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
 const previous=Object.hasOwn(original.receipts,eventId)
   ?original.receipts[eventId]:undefined;
 if(previous){
   if(previous.owner!==owner||previous.signature!==signature)
     throw new Error("Se reutilizó un identificador con una acción diferente.");
   return original;
 }
 if(Object.keys(original.receipts).length>=20_000)
   throw new Error("El encuentro alcanzó el límite de órdenes temporales.");
 // The server must refuse an unaffordable or cooling-down action AT
 // declaration, not accept it as a pending move that inevitably fails later.
 // This is a validation only: no mana is spent before its completion tick.
 if(command.kind==="ATTACK"&&command.usesMagic){
   if((snapshot.mana?.[owner]?.current??0)<1)
     throw new Error("Necesitas maná para declarar magia básica.");
 }
 if(command.kind==="CAST_SKILL"&&context.approvedSkill){
   const plan=context.approvedSkill;
   if((snapshot.mana?.[owner]?.current??0)<plan.cost)
     throw new Error("Maná insuficiente para declarar esa habilidad.");
   const start=Math.max(original.clock.nowTick,original.clock.actors[owner].availableAtTick);
   const currentRound=timelineRoundOf(start);
   const availableAt=snapshot.skillCooldowns?.[owner]?.[String(plan.id)]??0;
   if(availableAt===-1||availableAt>currentRound)
     throw new Error("Esta habilidad continúa en enfriamiento.");
 }
 if(command.kind==="COMMAND_SUMMON"){
   if(Object.keys(command).some(key=>
     !["kind","requestId","summonId","order","targetId",
       "newBehavior","planarMove"].includes(key)))
     throw new Error("La orden de invocación incluye parámetros no autorizados.");
   const creature=(snapshot.summons??[]).find(s=>
     s.id===command.summonId&&s.owner===owner&&s.integrity>0);
   if(!creature)throw new Error("No controlas esa invocación.");
   if(!["MOVE","CHANGE_BEHAVIOR","CHANGE_TARGET"].includes(command.order))
     throw new Error("La orden requiere un resolutor de contacto o ataque autónomo.");
 }
 if(command.kind==="USE_ITEM"){
   if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId)||
     Object.keys(command).some(key=>
       !["kind","itemId","characterItemId","requestId"].includes(key)))
     throw new Error("La orden de consumible incluye datos no permitidos.");
   if(owner==="PLAYER"&&command.characterItemId===undefined)
     throw new Error("Se requiere una copia de inventario auténtica.");
   const matches=(snapshot.consumables?.[owner]??[]).filter(item=>
     item.itemId===command.itemId&&
     item.characterItemId===command.characterItemId);
   if(matches.length!==1||matches[0].quantity<1)
     throw new Error("No tienes ese consumible disponible en el encuentro.");
   const item=matches[0];
   if(item.action==="HEAL_HP"&&snapshot.actors[owner].hp>=snapshot.actors[owner].maxHp)
     throw new Error("Ya tienes todos tus HP.");
   if(item.action==="RESTORE_MANA"&&
     (!snapshot.mana?.[owner]||
       snapshot.mana[owner].current>=snapshot.mana[owner].max))
     throw new Error("Ya tienes todo tu maná.");
 }
 // Only a fully approved intent is allowed into the clock. This compile
 // also rejects forged PA/tick durations and unauthorized skill plans.
 const intent=compileCombatTimelineIntent(snapshot,original.clock,owner,
   command,eventId,context);
 const clock=queueTimelineAction(original.clock,owner,intent);
 const next=structuredClone(original);
 next.clock=clock;
 next.declarations[eventId]={
   id:eventId,owner,command:structuredClone(command),signature,
   ...(command.kind==="CAST_SKILL"&&context.approvedSkill
     ?{approvedSkill:structuredClone(context.approvedSkill)}:{}),
 };
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
  pa:Record<Side,{used:number;limit:number}>;
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
   pa:Object.fromEntries((["PLAYER","NPC"] as const).map(side=>{
     const actor=session.clock.actors[side];
     return [side,{used:actor.spentApByRound[
       String(timelineRoundOf(session.clock.nowTick))]??0,
       limit:actor.apLimitPerRound}];
   })) as Record<Side,{used:number;limit:number}>,
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
 if(combat.status!=="ACTIVE")throw new Error("Este combate ya ha terminado.");
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
 if(updated.status==="FINISHED"){
   // Cancel other reserved actions on knockout, preserving their paid PA.
   // Receipts remain for idempotent lost-response retries.
   for(const owner of ["PLAYER","NPC"] as const){
     const running=timeline.clock.events.find(e=>e.owner===owner&&e.status==="QUEUED");
     if(running){
       timeline.clock=interruptTimelineAction(timeline.clock,owner);
       delete timeline.declarations[running.id];
     }
   }
 }
 return {combat:updated,timeline};
}
