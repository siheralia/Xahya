/**
 * Strict V2 fusion adapter. Only staff-approved, non-chaos fusions are
 * supported. A V1 shadow checks the complete recipe and sources; the
 * simultaneous V2 batch consumes the exact source IDs and creates the
 * approved composite, without borrowing V1's PA/tick ledger.
 */
import {applyResolvedCombatSkill,turnTicks,
  type CombatState,type CombatCommand} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {summonStat} from "./summons.ts";
import {timelineRoundOf,type ContinuousCombatTimeline,type TimelineEvent}
 from "./action-timeline.ts";
import {isolatePhysicalShadow} from "./timeline-basic-strike.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type Skill=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
const keyOk=(s:string)=>/^[a-zA-Z0-9:_-]{12,100}$/.test(s);

/** All source matching is by official entityKey AND concrete snapshot ID;
 * no client-selected creature can enter or leave a fusion.
 */
export function simulateApprovedTimelineFusion(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Skill,plan:CombatSkillPlan,
):AuthorizedTimelineEffect {
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.status!=="RESOLVED"||event.kind!=="SKILL"||
   event.endsAtTick!==clock.nowTick||event.paidAp!==1||
   event.durationTicks!==turnTicks(combat.actors[event.owner])||
   command.kind!=="CAST_SKILL"||command.skillId!==plan.id||
   !keyOk(command.requestId)||
   Object.keys(command).some(k=>!["kind","skillId","requestId"].includes(k))||
   plan.category!=="FUSION"||!plan.fusion||
   plan.fusion.sourceEntityKeys.length<2)
   throw new Error("La fusión requiere criaturas de origen aprobadas.");
 const by=event.owner,round=timelineRoundOf(event.endsAtTick);
 const currentMana=combat.mana?.[by]?.current;
 if(!Number.isSafeInteger(currentMana)||currentMana!<plan.cost)
   throw new Error("La fusión no tiene suficiente maná.");
 const available=combat.skillCooldowns?.[by]?.[String(plan.id)]??0;
 if(available===-1||available>round)
   throw new Error("La fusión todavía está en enfriamiento.");
 if((combat.summons??[]).some(s=>!s.chargesMigrated))
   throw new Error("La fusión necesita migrar las cargas de familiares anteriores.");
 const owner=combat.actors[by],origin=fieldPosition(owner);
 const consumed=plan.fusion.sourceEntityKeys.map(entityKey=>{
   const existing=(combat.summons??[]).filter(s=>
     s.owner===by&&s.entityKey===entityKey&&s.integrity>0&&
     s.expiresAtRound>round);
   if(existing.length!==1)
     throw new Error("Falta una criatura activa única para la fusión: "+entityKey);
   const summon=existing[0];
   if(Math.hypot(origin.x-summon.fieldPosition.x,
     origin.y-summon.fieldPosition.y)>Math.min(
       summon.controlRangeMeters,plan.fusion!.summon.controlRangeMeters)+1e-8)
     throw new Error("La criatura queda fuera del alcance de la fusión.");
   return summon;
 });
 if(new Set(consumed.map(x=>x.id)).size!==consumed.length)
   throw new Error("Las criaturas usadas en la fusión deben ser diferentes.");
 const shadow=isolatePhysicalShadow(combat,by);
 shadow.round=round;shadow.tick=(round-1)*100;
 const cast=applyResolvedCombatSkill(shadow,by,plan,
   {requestId:command.requestId},{hit:.5,critical:.5,defense:.5});
 if(cast.pending||cast.status!=="ACTIVE"||
   JSON.stringify(cast.combatCharges??{})!==JSON.stringify(combat.combatCharges??{}))
   throw new Error("La fusión intentó modificar cargas o ataques fuera del lote.");
 const previous=new Map((combat.summons??[]).map(s=>[s.id,s]));
 const after=new Map((cast.summons??[]).map(s=>[s.id,s]));
 const removed=(combat.summons??[]).filter(s=>!after.has(s.id));
 const created=(cast.summons??[]).filter(s=>!previous.has(s.id));
 if(removed.length!==consumed.length||created.length!==1||
   removed.some(s=>!consumed.some(x=>x.id===s.id))||
   (cast.summons?.length??0)!==(combat.summons?.length??0)-consumed.length+1||
   (combat.summons??[]).some(s=>!consumed.some(x=>x.id===s.id)&&
     JSON.stringify(s)!==JSON.stringify(after.get(s.id))))
   throw new Error("El resultado de la fusión no coincide con las fuentes aprobadas.");
 const result=created[0],template=plan.fusion.summon;
 if(result.owner!==by||result.entityKey!==template.entityKey||
   result.sourceSkillId!==plan.id||
   JSON.stringify(result.chaosField??null)!==
     JSON.stringify(plan.fusion.chaosField??null)||
   JSON.stringify(result.fusedFrom)!==
     JSON.stringify(consumed.map(x=>x.id))||
   result.chargesMigrated!==true)
   throw new Error("La criatura resultante no corresponde a la receta.");
 const spent=currentMana!-(cast.mana?.[by]?.current??NaN);
 const nextCooldown=cast.skillCooldowns?.[by]?.[String(plan.id)];
 if(spent!==plan.cost||typeof nextCooldown!=="number"||
   !Number.isSafeInteger(nextCooldown))
   throw new Error("La fusión no respetó el coste o enfriamiento.");
 const pace=Math.max(1,turnTicks({...owner,
   agility:summonStat(result,owner,"AGI"),
   speedValue:summonStat(result,owner,"MOVE_SPEED")}));
 const composite={...result,createdRound:round,
   expiresAtRound:round+template.durationTurns,
   autoRound:round,autoSpentAp:0,autoNextTick:event.endsAtTick+pace};
 return {eventId:event.id,
   manaSpent:{[by]:spent},
   summonsConsumed:consumed.map(s=>({id:s.id,owner:by})),
   summonsCreated:[composite],
   skillCooldowns:[{owner:by,skillId:plan.id,
     nextAvailableRound:nextCooldown}],
   logs:cast.log.filter(x=>x.kind==="SUMMON"||x.kind==="SKILL")
     .map(x=>({...x,tick:event.endsAtTick})),
 };
}
