/**
 * Creation and upkeep for server-approved summoned creatures under V2.
 * Shadow V1 is used only to compile legal formation/commands. Its clock, PA
 * and mana bookkeeping do not enter the V2 state. Autonomous actions require
 * their own event batch, never passive "free" hits while the clock is idle.
 */
import {
 applyResolvedCombatSkill,applyCombatCommand,turnTicks,actionPoints,
 type CombatCommand,type CombatState,type Side,
} from "./turn-engine.ts";
import {timelineRoundOf,type ContinuousCombatTimeline,type TimelineEvent}
 from "./action-timeline.ts";
import {fieldPosition} from "./field-plane.ts";
import {summonStat,type CombatSummon} from "./summons.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import {isolatePhysicalShadow} from "./timeline-basic-strike.ts";

type Skill=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
type Order=Extract<CombatCommand,{kind:"COMMAND_SUMMON"}>;
const sides=["PLAYER","NPC"] as const;
const validEvent=(c:CombatState,t:ContinuousCombatTimeline,e:TimelineEvent)=>
 c.status==="ACTIVE"&&!c.pending&&t.version===2&&e.status==="RESOLVED"&&
 t.nowTick===e.endsAtTick&&e.paidAp===1&&
 e.durationTicks===turnTicks(c.actors[e.owner]);
const safeId=(s:string)=>/^[a-zA-Z0-9:_-]{12,100}$/.test(s);

function shadowForWorld(c:CombatState,owner:Side,finishTick:number):CombatState{
 const shadow=isolatePhysicalShadow(c,owner);
 shadow.round=timelineRoundOf(finishTick);
 shadow.tick=(shadow.round-1)*100;
 return shadow;
}

/** Materialize approved creatures in the same spiral the live V1 uses.
 * The delta between the V1 creation timestamp and the creature's first
 * autonomous tick is rebased to the actual V2 completion timestamp.
 */
export function simulateApprovedTimelineSummon(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Skill,plan:CombatSkillPlan,
):AuthorizedTimelineEffect{
 if(!validEvent(combat,clock,event)||event.kind!=="SUMMON"||
   command.kind!=="CAST_SKILL"||command.skillId!==plan.id||
   Object.keys(command).some(x=>!["kind","skillId","requestId"].includes(x))||
   !safeId(command.requestId)||plan.category!=="SUMMON"||
   !plan.summons?.length)
   throw new Error("La criatura requiere una invocación temporal aprobada.");
 if((combat.summons??[]).some(s=>s.chaosField||!s.chargesMigrated))
   throw new Error("La creación requiere un resolutor de obstáculos o cargas avanzado.");
 const mana=combat.mana?.[event.owner]?.current??0;
 if(!Number.isFinite(mana)||mana<plan.cost)
   throw new Error("No hay maná suficiente para invocar.");
 const ending=timelineRoundOf(event.endsAtTick);
 const available=combat.skillCooldowns?.[event.owner]?.[String(plan.id)]??0;
 if(available===-1||available>ending)
   throw new Error("La invocación todavía está en enfriamiento.");
 const shadow=shadowForWorld(combat,event.owner,event.endsAtTick);
 const cast=applyResolvedCombatSkill(shadow,event.owner,plan,{
   requestId:command.requestId,
 },{hit:0.5,critical:0.5,defense:0.5});
 if(cast.pending)throw new Error("La invocación creó un ataque sin autorización.");
 const ids=new Set((combat.summons??[]).map(x=>x.id));
 const fresh=(cast.summons??[]).filter(x=>!ids.has(x.id));
 if(fresh.length!==plan.summons.length||
   (cast.summons?.length??0)!==(combat.summons?.length??0)+fresh.length)
   throw new Error("Invocaciones creadas fuera del plan autorizado.");
 const spent=(combat.mana?.[event.owner]?.current??0)-
   (cast.mana?.[event.owner]?.current??0);
 if(spent!==plan.cost)throw new Error("Coste de invocación no coincide con el catálogo.");
 const nextCooldown=cast.skillCooldowns?.[event.owner]?.[String(plan.id)];
 if(typeof nextCooldown!=="number"||!Number.isSafeInteger(nextCooldown))
   throw new Error("Enfriamiento de invocación inválido.");
 const summonsCreated=fresh.map(creature=>{
   const gap=(creature.autoNextTick??NaN)-cast.tick;
   if(!Number.isSafeInteger(gap)||gap<=0)
     throw new Error("Falta un turno autónomo autorizado para la criatura.");
   const template=plan.summons!.find(t=>t.entityKey===creature.entityKey);
   if(!template)throw new Error("La criatura no está en la habilidad aprobada.");
   return {...creature,
     createdRound:ending,expiresAtRound:ending+template.durationTurns,
     autoRound:ending,autoSpentAp:0,autoNextTick:event.endsAtTick+gap,
   };
 });
 return {
   eventId:event.id,manaSpent:{[event.owner]:spent},summonsCreated,
   skillCooldowns:[{owner:event.owner,skillId:plan.id,
     nextAvailableRound:nextCooldown}],
   logs:cast.log.filter(x=>x.kind==="SKILL"||x.kind==="SUMMON")
     .map(x=>({...x,tick:event.endsAtTick})),
 };
}

/** Conservative command subset. Creature ATTACK / ACT may alter target HP,
 * summon integrity and arbitrary statuses; they must not be downgraded into
 * ordinary movement while the autonomous simultaneous resolver is pending.
 */
export function simulateTimelineSummonOrder(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Order,
):AuthorizedTimelineEffect{
 if(!validEvent(combat,clock,event)||event.kind!=="SUMMON"||
   command.kind!=="COMMAND_SUMMON"||
   !["CHANGE_BEHAVIOR","CHANGE_TARGET","MOVE"].includes(command.order)||
   Object.keys(command).some(key=>!["kind","requestId","summonId",
     "order","targetId","newBehavior","planarMove"].includes(key)))
   throw new Error("La orden necesita el resolutor temporal de ataques de criatura.");
 const creature=(combat.summons??[]).find(x=>
   x.id===command.summonId&&x.owner===event.owner);
 if(!creature||!creature.chargesMigrated||creature.chaosField)
   throw new Error("No controlas esa criatura temporal.");
 const shadow=shadowForWorld(combat,event.owner,event.endsAtTick);
 const resolved=applyCombatCommand(shadow,event.owner,command,
   {hit:0.5,critical:0.5,defense:0.5});
 if(resolved.pending)throw new Error("La orden generó un ataque no autorizado.");
 const after=(resolved.summons??[]).find(x=>x.id===command.summonId);
 if(!after||after.integrity!==creature.integrity)
   throw new Error("La orden modificó la integridad sin una colisión aprobada.");
 const changed:NonNullable<AuthorizedTimelineEffect["summonUpdates"]>[number]={
   id:creature.id,owner:event.owner,
 };
 if(command.order==="CHANGE_BEHAVIOR"){
   changed.behaviorMode=after.behavior.mode;
 }else if(command.order==="CHANGE_TARGET"){
   changed.targetId=after.targetId;
 }else{
   changed.fieldPosition={...after.fieldPosition};
   const pace=(after.autoNextTick??NaN)-resolved.tick;
   if(!Number.isSafeInteger(pace)||pace<=0)
     throw new Error("La orden no reservó el turno propio del familiar.");
   changed.autoNextTick=event.endsAtTick+pace;
   changed.autoRound=timelineRoundOf(event.endsAtTick);
   changed.autoSpentAp=after.autoSpentAp??0;
 }
 return {eventId:event.id,summonUpdates:[changed],
   logs:resolved.log.filter(e=>e.kind==="SUMMON")
     .map(x=>({...x,tick:event.endsAtTick}))};
}

/** Upkeep is 100-tick boundary work, before subsequent impact damage.
 * A dropped/dead creature consumes no mana. Per-creature maintenance is
 * evaluated in the preserved materialization order (V1 semantics).
 */
export function upkeepTimelineSummonsAtRound(state:CombatState,tick:number):void{
 if(!Number.isSafeInteger(tick)||tick<=0||tick%100!==0||
   timelineRoundOf(tick)!==state.round)
   throw new Error("Límite de mantenimiento temporal inválido.");
 const existing=state.summons??[];
 if(existing.some(x=>!x.chargesMigrated||x.chaosField))
   throw new Error("La criatura requiere migración de cargas o campo especial.");
 const retained:CombatSummon[]=[];
 for(const summon of existing){
   const owner=state.actors[summon.owner],mana=state.mana?.[summon.owner];
   const origin=fieldPosition(owner);
   const outOfRange=Math.hypot(summon.fieldPosition.x-origin.x,
     summon.fieldPosition.y-origin.y)>summon.controlRangeMeters+1e-8;
   const expired=state.round>=summon.expiresAtRound||
     owner.hp<=0||outOfRange||!mana||mana.current<summon.maintenanceMana;
   const reason=outOfRange?" (fuera de control).":
     state.round>=summon.expiresAtRound?" (fin de duración).":
     " (sin maná para mantenimiento).";
   const log=expired?summon.label+" desapareció"+reason:
     summon.label+" se mantuvo activo por "+
       summon.maintenanceMana+" maná.";
   state.narrativeHistory??=[...state.log];
   const entry={kind:"SUMMON",tick,by:summon.owner,summonId:summon.id,
     ...(expired?{}:{manaCost:summon.maintenanceMana}),summary:log};
   state.narrativeHistory.push(entry);
   state.log.push(entry);
   if(expired)continue;
   mana!.current-=summon.maintenanceMana;
   retained.push(summon);
 }
 state.summons=retained;
}

/** Future auxiliary-event integration uses these exact due ticks. No
 * API should fast-forward past one of them or allow autonomous contact to
 * fire without passing through a simultaneous, defender-visible batch.
 */
export type SummonAutonomousDue={tick:number;summonId:string;owner:Side;
 behavior:CombatSummon["behavior"]["mode"]};
export function scheduleAutonomousSummonTicks(
 combat:CombatState,fromTick:number,toTick:number,maxEvents=256,
):SummonAutonomousDue[]{
 if(!Number.isSafeInteger(fromTick)||!Number.isSafeInteger(toTick)||
   fromTick<0||toTick<fromTick||
   !Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>2048)
   throw new Error("Horizonte autónomo inválido.");
 const due:SummonAutonomousDue[]=[];
 for(const summon of combat.summons??[]){
   if(summon.integrity<=0||["HOLD","MANUAL"].includes(summon.behavior.mode))
     continue;
   if(!summon.chargesMigrated||summon.chaosField)
     throw new Error("El familiar requiere ejecución temporal avanzada.");
   const dueAt=summon.autoNextTick;
   if(typeof dueAt!=="number"||!Number.isSafeInteger(dueAt)||dueAt<0)
     throw new Error("El familiar no tiene próximo tick propio.");
   const owner=combat.actors[summon.owner];
   const home=fieldPosition(owner);
   if(owner.hp<=0||
     Math.hypot(home.x-summon.fieldPosition.x,home.y-summon.fieldPosition.y)>
       summon.controlRangeMeters+1e-8)continue;
   const creature={...owner,agility:summonStat(summon,owner,"AGI"),
     speedValue:summonStat(summon,owner,"MOVE_SPEED")};
   const pace=Math.max(1,turnTicks(creature));
   const apLimit=actionPoints(summonStat(summon,owner,"CON"));
   for(let tick=dueAt;tick<=toTick;tick+=pace){
     if(tick<=fromTick)continue;
     if(timelineRoundOf(tick)>=summon.expiresAtRound)continue;
     const used=summon.autoRound===timelineRoundOf(tick)?
       summon.autoSpentAp??0:0;
     const already=due.filter(d=>d.summonId===summon.id&&
       timelineRoundOf(d.tick)===timelineRoundOf(tick)).length;
     if(used+already>=apLimit)continue;
     due.push({tick,summonId:summon.id,owner:summon.owner,
       behavior:summon.behavior.mode});
     if(due.length>maxEvents)
       throw new Error("Demasiados acontecimientos de familiares.");
   }
 }
 return due.sort((a,b)=>a.tick-b.tick||a.summonId.localeCompare(b.summonId));
}
