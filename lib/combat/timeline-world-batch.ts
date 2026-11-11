/**
 * V2 autonomous world-event merger.
 *
 * An independent creature or mirror can finish BEFORE either fighter's
 * declared action. Commit only that due tick and leave both reservations
 * QUEUED. At a tie, resolve world effects and player attacks against one
 * post-upkeep snapshot, then atomically commit ALL authorized deltas.
 *
 * Synthetic event IDs, owners and times are computed from SERVER encounter
 * objects. They are never client commands, never spend the owner's PA,
 * and never enter the declaration receipt ledger.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import {
  interruptTimelineAction,timelineRoundOf,
  type TimelineBatch,type TimelineEvent,
} from "./action-timeline.ts";
import {
  finalizeTimelineCommit,prepareTimelineCommit,
  type TimelineDeclaration,type TimelineDeclarationSession,
} from "./timeline-declarations.ts";
import {
  resolveAuthorizedTimelineBatch,type AuthorizedTimelineEffect,
} from "./timeline-batch-resolver.ts";
import {scheduleAutonomousSummonTicks} from "./timeline-summon-world.ts";
import {scheduleMirrorRayTicks} from "./timeline-construction-world.ts";

export type WorldTimelineEvent=TimelineEvent&{
 kind:"AUTO_SUMMON"|"AUTO_MIRROR";sourceEntityId:string;
};
export type WorldTimelineResolve=(
 snapshot:Readonly<CombatState>,event:Readonly<WorldTimelineEvent>,
 batch:Readonly<TimelineBatch>,
)=>AuthorizedTimelineEffect|Promise<AuthorizedTimelineEffect>;
export type DeclaredTimelineResolve=(
 snapshot:Readonly<CombatState>,declaration:Readonly<TimelineDeclaration>,
 event:Readonly<TimelineEvent>,batch:Readonly<TimelineBatch>,
)=>AuthorizedTimelineEffect|Promise<AuthorizedTimelineEffect>;

const auto=(event:TimelineEvent):event is WorldTimelineEvent=>
 event.kind==="AUTO_SUMMON"||event.kind==="AUTO_MIRROR";
const key=(kind:WorldTimelineEvent["kind"],id:string,tick:number)=>
  "WORLD:"+kind+":"+tick+":"+encodeURIComponent(id);

function boundaries(from:number,to:number):number[]{
 const result:number[]=[];
 for(let n=(Math.floor(from/100)+1)*100;n<=to;n+=100)
   result.push(n);
 return result;
}

/** True when the same creature is already using its own slot in a manually
 * commanded move. Merely ordering a different creature does NOT consume the
 * automated actor's time.
 */
function occupiesCreatureSlot(
 session:TimelineDeclarationSession,batch:TimelineBatch,
 owner:Side,summonId:string,tick:number,
):boolean{
 return batch.events.some(event=>{
   if(event.owner!==owner||event.endsAtTick!==tick)return false;
   const cmd=session.declarations[event.id]?.command;
   return cmd?.kind==="COMMAND_SUMMON"&&cmd.summonId===summonId;
 });
}

export function nextWorldTimelineBatch(
 combat:CombatState,session:TimelineDeclarationSession,
):{batch:TimelineBatch;hasDeclaredEvents:boolean}|null{
 const expected=prepareTimelineCommit(session);
 if(!expected)return null;
 const until=expected.batch.atTick,from=session.clock.nowTick;
 if(combat.tick!==from)
   throw new Error("El reloj de la sesión difiere del encuentro temporal.");
 const dueSummons=scheduleAutonomousSummonTicks(combat,from,until)
   .filter(d=>!occupiesCreatureSlot(session,expected.batch,d.owner,d.summonId,d.tick));
 const dueMirrors=scheduleMirrorRayTicks(combat,from,until);
 const first=Math.min(until,
   ...dueSummons.map(e=>e.tick),...dueMirrors.map(e=>e.tick));
 const earliestSummons=dueSummons.filter(e=>e.tick===first);
 const earliestMirrors=dueMirrors.filter(e=>e.tick===first);
 if(earliestSummons.length+earliestMirrors.length>256)
   throw new Error("Demasiados sucesos autónomos simultáneos.");
 const hasDeclaredEvents=first===until;
 const clock=hasDeclaredEvents?expected.batch.state:structuredClone(session.clock);
 clock.nowTick=first;
 const worldEvents:WorldTimelineEvent[]=[];
 for(const due of earliestSummons){
   worldEvents.push({
     id:key("AUTO_SUMMON",due.summonId,first),kind:"AUTO_SUMMON",
     owner:due.owner,sourceEntityId:due.summonId,
     startsAtTick:first,endsAtTick:first,durationTicks:0,paidAp:0,
     sequence:clock.nextSequence+worldEvents.length,status:"RESOLVED",
   });
 }
 for(const due of earliestMirrors){
   worldEvents.push({
     id:key("AUTO_MIRROR",due.constructionId,first),kind:"AUTO_MIRROR",
     owner:due.owner,sourceEntityId:due.constructionId,
     startsAtTick:first,endsAtTick:first,durationTicks:0,paidAp:0,
     sequence:clock.nextSequence+worldEvents.length,status:"RESOLVED",
   });
 }
 // Use stable ID ordering; insertion order and client request timing must not
 // determine the winner of a simultaneous clash.
 worldEvents.sort((a,b)=>a.kind.localeCompare(b.kind)||
   a.sourceEntityId.localeCompare(b.sourceEntityId));
 const events=[...(hasDeclaredEvents?expected.batch.events:[]),...worldEvents];
 if(events.length===0||new Set(events.map(e=>e.id)).size!==events.length)
   throw new Error("Eventos del mundo temporal inválidos o duplicados.");
 return {
   batch:{state:clock,atTick:first,events,simultaneous:events.length>1,
     crossedRoundBoundaries:boundaries(from,first)},
   hasDeclaredEvents,
 };
}

/** The effects API guarantees the same pre-impact snapshot for all fighters,
 * creatures and mirror rays. A result may advance the clock without retiring
 * either user's longer action. Both state and session must later be saved in
 * one serialized transaction; a failed validation leaves inputs untouched.
 */
export async function resolveWorldTimelineBatch(
 combat:CombatState,session:TimelineDeclarationSession,
 resolveDeclared:DeclaredTimelineResolve,resolveWorld:WorldTimelineResolve,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession}|null>{
 if(combat.status!=="ACTIVE")throw new Error("Combate terminado.");
 const proposed=nextWorldTimelineBatch(combat,session);
 if(!proposed)return null;
 const pre=prepareTimelineCommit(session);
 if(!pre)throw new Error("Faltan declaraciones para el lote temporal.");
 const byId=new Map(pre.declarations.map(entry=>[entry.id,entry]));
 const nextCombat=await resolveAuthorizedTimelineBatch(
   combat,proposed.batch,(snapshot,event,batch)=>{
     if(auto(event))return resolveWorld(snapshot,event,batch);
     const declaration=byId.get(event.id);
     if(!declaration||declaration.owner!==event.owner)
       throw new Error("El impacto carece de declaración autorizada.");
     return resolveDeclared(snapshot,declaration,event,batch);
   });
 const timeline=proposed.hasDeclaredEvents
   ?finalizeTimelineCommit(session,pre):structuredClone(session);
 if(!proposed.hasDeclaredEvents)timeline.clock.nowTick=proposed.batch.atTick;
 if(nextCombat.status==="FINISHED"){
   for(const owner of ["PLAYER","NPC"] as const){
     const running=timeline.clock.events.find(event=>
       event.owner===owner&&event.status==="QUEUED");
     if(running){
       timeline.clock=interruptTimelineAction(timeline.clock,owner);
       delete timeline.declarations[running.id];
     }
   }
 }
 return {combat:nextCombat,timeline};
}
