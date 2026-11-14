import {reservedTimelineTurnTicks} from "./timeline-tempo.ts";
/**
 * Strict V2 adapter for trusted, approved COMPOSED support skills.
 *
 * Accepts ONLY self-targeted modular plans compiled by the server's existing
 * review/activation allowlist. Executes the approved graph on one immutable
 * pre-impact fighter snapshot; the atomic batch applies HP healing, flat
 * bonuses, personal statuses, mana and cooldowns at the completion tick.
 *
 * OFFENSE, SUMMON, CONSTRUCTION, FUSION and CHARGE_BUFF continue to require
 * their dedicated timed mechanics and cannot enter through this adapter.
 */
import {type CombatState,type CombatCommand} from "./turn-engine.ts";
import {resolveApprovedSupportActivation} from "./approved-support-activation.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {ContinuousCombatTimeline,TimelineEvent} from "./action-timeline.ts";
import {timelineRoundOf} from "./action-timeline.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type SkillCommand=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
const allowedCommandKeys=new Set(["kind","skillId","requestId"]);

export function simulateApprovedTimelineSupport(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:SkillCommand,plan:CombatSkillPlan,
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.status!=="RESOLVED"||event.kind!=="SKILL"||
   clock.nowTick!==event.endsAtTick||
   event.paidAp!==1||event.durationTicks!==reservedTimelineTurnTicks(combat.actors[event.owner],event))
   throw new Error("El soporte no está autorizado para ejecutarse en este tick.");
 if(command.kind!=="CAST_SKILL"||command.skillId!==plan?.id||
   plan.category!=="SUPPORT"||!plan.approvedActivation||
   !Number.isSafeInteger(plan.cost)||plan.cost<1||
   Object.entries(command).some(([key,value])=>
     value!==undefined&&!allowedCommandKeys.has(key)))
   throw new Error("La habilidad necesita un soporte modular personal revisado.");
 if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId))
   throw new Error("Identificador de habilidad modular inválido.");
 const owner=event.owner,fighter=combat.actors[owner],mana=combat.mana?.[owner];
 if(!mana||!Number.isSafeInteger(mana.current)||mana.current<plan.cost)
   throw new Error("No hay maná suficiente para esta habilidad.");
 const round=timelineRoundOf(event.endsAtTick);
 const cooldown=combat.skillCooldowns?.[owner]?.[String(plan.id)]??0;
 if(cooldown===-1||cooldown>round)
   throw new Error("La habilidad se encuentra en enfriamiento.");
 const result=resolveApprovedSupportActivation(plan.approvedActivation,fighter,owner);
 const duration=plan.approvedActivation.durationTurns;
 if((result.bonuses.length||result.statuses.length)&&
   (!Number.isSafeInteger(duration)||duration<1||duration>20))
   throw new Error("Las mejoras requieren duración de rondas válida.");
 const statBonuses=result.bonuses.map(bonus=>({
   owner,skillId:plan.id,skillName:plan.name,stat:bonus.stat,
   value:bonus.value,durationTurns:duration,
 }));
 const selfStatuses=result.statuses.map((status,index)=>({
   owner,skillId:plan.id,
   id:"V2_SUPPORT:"+owner+":"+plan.id+":"+event.id+":"+index,
   stat:status.stat,operation:status.operation,value:status.value,
   durationTurns:status.durationTurns,
 }));
 const nextAvailableRound=plan.oncePerCombat?-1:
   plan.cooldownRounds>0?round+plan.cooldownRounds+1:0;
 const summary=fighter.name+" usó "+plan.name+
   (result.healed?" y recuperó "+Number(result.healed.toFixed(2))+" HP":"")+
   (statBonuses.length?" y obtuvo "+statBonuses.length+" bono(s) temporal(es)":"")+
   (selfStatuses.length?" y aplicó "+selfStatuses.length+" estado(s) propio(s)":"");
 return {
   eventId:event.id,manaSpent:{[owner]:plan.cost},
   ...(result.healed>0?{hpHealing:{[owner]:result.healed}}:{}),
   statBonuses,selfStatuses,
   skillCooldowns:[{owner,skillId:plan.id,nextAvailableRound}],
   logs:[{kind:"SKILL",tick:event.endsAtTick,by:owner,
     skillId:plan.id,skillName:plan.name,manaCost:plan.cost,
     healingPoints:result.healed||undefined,summary}],
 };
}
