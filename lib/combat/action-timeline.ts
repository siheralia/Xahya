/**
 * Deterministic action scheduler for combat's continuous (v2) tick timeline.
 *
 * This module is intentionally pure and server-agnostic: the live v1 attack
 * resolver must not be replaced until commands, damages and reactions have
 * all been migrated atomically. Timed events are _reservations_, not strikes
 * that deal damage when submitted. The caller executes the returned batch
 * together and applies HP/wear only after every concurrent event is known.
 */
export const TIMELINE_TICKS_PER_ROUND = 100;
export type TimelineSide = "PLAYER" | "NPC";
export type TimelineActionKind = "ATTACK" | "MOVE" | "BLOCK" | "SKILL" | "SUMMON" | "WAIT";
export type TimelineEventStatus = "QUEUED" | "RESOLVED" | "INTERRUPTED";

export interface TimelineEvent {
  id: string;
  owner: TimelineSide;
  kind: TimelineActionKind;
  /** Absolute ticks. Never clip an action to an arbitrary round boundary. */
  startsAtTick: number;
  endsAtTick: number;
  durationTicks: number;
  paidAp: number;
  /** The exact item copy being held, not an item catalog definition. */
  blockToolCopyId?: number;
  status: TimelineEventStatus;
  /** Stable insertion sequence for resolving simultaneous events. */
  sequence: number;
}

export interface TimelineActor {
  availableAtTick: number;
  apLimitPerRound: number;
  spentApByRound: Record<string, number>;
}

export interface ContinuousCombatTimeline {
  version: 2;
  nowTick: number;
  nextSequence: number;
  actors: Record<TimelineSide, TimelineActor>;
  events: TimelineEvent[];
  /** Durable request ledger; pruning old event bodies must never enable replay. */
  seenActionIds: string[];
}

export type TimelineIntent = {
  id: string;
  kind: TimelineActionKind;
  durationTicks: number;
  paCost: number;
  blockToolCopyId?: number;
};

const SIDES: readonly TimelineSide[] = ["PLAYER", "NPC"];
const validTick=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const validDuration=(n:number)=>Number.isSafeInteger(n)&&n>0&&n<=1_000_000;
const validPa=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=100;
const validId=(id:string)=>/^[a-zA-Z0-9_:-]{1,100}$/.test(id);

export function timelineRoundOf(tick:number):number {
  if(!validTick(tick))throw new Error("Tick de combate inválido.");
  return Math.floor(tick/TIMELINE_TICKS_PER_ROUND)+1;
}

export function newContinuousCombatTimeline(playerAp:number,npcAp:number):ContinuousCombatTimeline {
  if(!validPa(playerAp)||playerAp<1||!validPa(npcAp)||npcAp<1)
    throw new Error("Puntos de acción inválidos para el planificador.");
  return {
    version:2,nowTick:0,nextSequence:0,
    actors:{
      PLAYER:{availableAtTick:0,apLimitPerRound:playerAp,spentApByRound:{}},
      NPC:{availableAtTick:0,apLimitPerRound:npcAp,spentApByRound:{}},
    },
    events:[],seenActionIds:[],
  };
}

function checkTimeline(state:ContinuousCombatTimeline):void {
  if(state?.version!==2||!validTick(state.nowTick)||!Number.isSafeInteger(state.nextSequence))
    throw new Error("Estado del reloj de combate inválido.");
}

export function queueTimelineAction(
  original:ContinuousCombatTimeline,owner:TimelineSide,intent:TimelineIntent,
):ContinuousCombatTimeline {
  checkTimeline(original);
  if(!SIDES.includes(owner))throw new Error("Combatiente temporal inválido.");
  if(!intent||!validId(intent.id)||!validDuration(intent.durationTicks)||
    !validPa(intent.paCost)||!["ATTACK","MOVE","BLOCK","SKILL","SUMMON","WAIT"].includes(intent.kind))
    throw new Error("Acción temporal inválida.");
  if(intent.kind!=="WAIT"&&intent.paCost===0)
    throw new Error("Las acciones activas requieren PA; solo ESPERAR puede ser gratuito.");
  if(intent.kind==="BLOCK"&&intent.blockToolCopyId!==undefined&&
    (!Number.isSafeInteger(intent.blockToolCopyId)||intent.blockToolCopyId<=0))
    throw new Error("El bloqueo requiere una copia equipada válida.");
  if(intent.kind!=="BLOCK"&&intent.blockToolCopyId!==undefined)
    throw new Error("Solo BLOQUEAR puede reservar una copia de equipo.");
  if(original.seenActionIds.includes(intent.id)||original.events.some(x=>x.id===intent.id))
    throw new Error("Identificador de acción temporal duplicado.");
  // Waiting for a fighter to select a new intent is deliberate: the other
  // fighter's long action must never jump to its end without this chance.
  if(original.events.some(x=>x.owner===owner&&x.status==="QUEUED"))
    throw new Error("El combatiente ya tiene una acción temporal pendiente.");
  const actor=original.actors[owner];
  const start=Math.max(original.nowTick,actor.availableAtTick);
  const finish=start+intent.durationTicks;
  if(!validTick(finish))throw new Error("El horizonte temporal es demasiado largo.");
  const round=String(timelineRoundOf(start));
  if((actor.spentApByRound[round]??0)+intent.paCost>actor.apLimitPerRound)
    throw new Error("No quedan PA para iniciar esa acción en esta ronda.");
  if(original.seenActionIds.length>=20_000)throw new Error("Límite de acciones del encuentro superado.");
  const next=structuredClone(original),updated=next.actors[owner];
  next.seenActionIds.push(intent.id);
  updated.spentApByRound[round]=(updated.spentApByRound[round]??0)+intent.paCost;
  updated.availableAtTick=finish;
  next.events.push({id:intent.id,owner,kind:intent.kind,startsAtTick:start,
    endsAtTick:finish,durationTicks:intent.durationTicks,paidAp:intent.paCost,
    ...(intent.kind==="BLOCK"&&intent.blockToolCopyId!==undefined
      ?{blockToolCopyId:intent.blockToolCopyId}:{}),
    status:"QUEUED",sequence:next.nextSequence++});
  return next;
}

export function pendingTimelineSides(state:ContinuousCombatTimeline):TimelineSide[] {
  checkTimeline(state);
  return SIDES.filter(side=>!state.events.some(event=>
    event.owner===side&&event.status==="QUEUED"));
}

export function activeTimelineBlockAt(
 state:ContinuousCombatTimeline,owner:TimelineSide,impactTick:number,
):TimelineEvent|null {
 checkTimeline(state);
 if(!SIDES.includes(owner)||!validTick(impactTick))
   throw new Error("Consulta de guardia temporal inválida.");
 // [start,end): the guard blocks many separate strikes during its interval,
 // but not at the exact tick in which it finishes. It is not spent per hit.
 return state.events.find(event=>event.owner===owner&&event.kind==="BLOCK"&&
   event.status!=="INTERRUPTED"&&event.startsAtTick<=impactTick&&
   impactTick<event.endsAtTick)??null;
}

export type TimelineBatch={
  state:ContinuousCombatTimeline;
  atTick:number;
  events:TimelineEvent[];
  simultaneous:boolean;
};

/** Move the clock to exactly the next completed action, never to a response
 * timestamp or the end of a 100-tick round. Combatants must have declared
 * their next intention (including WAIT) to advance past another active
 * participant's possible response. Same-tick events are returned as ONE batch:
 * the game resolver should calculate their damage simultaneously.
 */
export function completeNextTimelineBatch(
 original:ContinuousCombatTimeline,requiredActors:readonly TimelineSide[]=SIDES,
):TimelineBatch {
 checkTimeline(original);
 const waiting=requiredActors.filter(side=>!SIDES.includes(side)||pendingTimelineSides(original).includes(side));
 if(waiting.length)throw new Error("Faltan acciones temporales de: "+waiting.join(", "));
 const queued=original.events.filter(e=>e.status==="QUEUED");
 if(!queued.length)throw new Error("No quedan acontecimientos temporales pendientes.");
 const tick=Math.min(...queued.map(event=>event.endsAtTick));
 if(tick<original.nowTick)throw new Error("La cola de eventos retrocedería en el tiempo.");
 const next=structuredClone(original);
 next.nowTick=tick;
 const batch=next.events.filter(e=>e.status==="QUEUED"&&e.endsAtTick===tick)
   .sort((a,b)=>a.sequence-b.sequence);
 for(const event of batch)event.status="RESOLVED";
 // Retain a bounded chronological audit trace without losing queued events.
 const resolved=next.events.filter(e=>e.status!=="QUEUED");
 if(resolved.length>256){
   const keepIds=new Set(resolved.slice(-256).map(e=>e.id));
   next.events=next.events.filter(e=>e.status==="QUEUED"||keepIds.has(e.id));
 }
 return {state:next,atTick:tick,events:batch,simultaneous:batch.length>1};
}

/** An interrupted guard stops at the current tick, not at the original
 * deadline. Paid AP remain spent: interruptions cannot mint free turns.
 */
export function interruptTimelineAction(
 original:ContinuousCombatTimeline,owner:TimelineSide,
):ContinuousCombatTimeline {
 checkTimeline(original);
 if(!SIDES.includes(owner))throw new Error("Combatiente temporal inválido.");
 const pending=original.events.find(e=>e.owner===owner&&e.status==="QUEUED");
 if(!pending)throw new Error("No hay una acción que interrumpir.");
 const next=structuredClone(original);
 const event=next.events.find(e=>e.sequence===pending.sequence)!;
 event.status="INTERRUPTED";
 event.endsAtTick=Math.max(event.startsAtTick,next.nowTick);
 next.actors[owner].availableAtTick=next.nowTick;
 return next;
}
