import {reservedTimelineTurnTicks} from "./timeline-tempo.ts";
/**
 * V2 activation of server-approved CHARGE_BUFF. Owner-scoped charges
 * are consumed at the action's deadline, never on declaration.
 * The same micro compiler as V1 guarantees a bounded 1..6 input and
 * a reviewed multiplier (max x3) with limited duration.
 */
import {type CombatState,type CombatCommand}
 from "./turn-engine.ts";
import {combatChargeBalance} from "./charge-pools.ts";
import {resolveStatusStat,type StatusStat} from "./summon-status.ts";
import {timelineRoundOf,type ContinuousCombatTimeline,type TimelineEvent}
 from "./action-timeline.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type Skill=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
export function simulateApprovedTimelineChargeBuff(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Skill,plan:CombatSkillPlan,
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.status!=="RESOLVED"||event.kind!=="SKILL"||
   event.endsAtTick!==clock.nowTick||event.paidAp!==1||
   event.durationTicks!==reservedTimelineTurnTicks(combat.actors[event.owner],event)||
   command.kind!=="CAST_SKILL"||command.skillId!==plan.id||
   !/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId)||
   Object.keys(command).some(k=>!["kind","skillId","requestId",
     "chargesToSpend"].includes(k))||
   plan.category!=="CHARGE_BUFF"||!plan.chargeBuff)
   throw new Error("Esta potenciación requiere una habilidad de cargas aprobada.");
 const buff=plan.chargeBuff,count=command.chargesToSpend,owner=event.owner;
 if(!Number.isSafeInteger(count)||count===undefined||
   count<buff.minCharges||count>buff.maxCharges||
   buff.maxCharges>6||buff.stats.length<1||buff.stats.length>8||
   buff.perChargePercent*count>200)
   throw new Error("La cantidad de cargas no coincide con el plan autorizado.");
 const charges=combatChargeBalance(combat,owner,buff.accumulator);
 if(charges<count)
   throw new Error("No tienes suficientes cargas de combate.");
 const mana=combat.mana?.[owner]?.current;
 if(!Number.isFinite(mana)||mana!<plan.cost)
   throw new Error("No hay maná suficiente para la potenciación.");
 const round=timelineRoundOf(event.endsAtTick);
 const cooldown=combat.skillCooldowns?.[owner]?.[String(plan.id)]??0;
 if(cooldown===-1||cooldown>round)
   throw new Error("La habilidad continúa en enfriamiento.");
 const factor=1+(buff.perChargePercent*count)/100;
 const stats=buff.stats.map(resolveStatusStat);
 if(stats.some(s=>!s)||new Set(stats).size!==stats.length||
   factor<=1||factor>3)
   throw new Error("Las estadísticas de la potenciación son inválidas.");
 const statuses=stats.map((stat,index)=>({
   owner,skillId:plan.id,
   id:"V2_CHARGE:"+owner+":"+plan.id+":"+event.id+":"+index,
   stat:stat as StatusStat,operation:"MULTIPLIER" as const,
   value:factor,durationTurns:buff.durationTurns,
 }));
 const nextAvailableRound=plan.oncePerCombat?-1:
   plan.cooldownRounds>0?round+plan.cooldownRounds+1:0;
 return {eventId:event.id,
   manaSpent:{[owner]:plan.cost},
   combatChargeSpends:[{owner,accumulator:buff.accumulator,amount:count}],
   selfStatuses:statuses,
   skillCooldowns:[{owner,skillId:plan.id,nextAvailableRound}],
   logs:[{kind:"SKILL",tick:event.endsAtTick,by:owner,skillId:plan.id,
     skillName:plan.name,manaCost:plan.cost,
     summary:combat.actors[owner].name+" activó "+plan.name+
       " y consumió "+count+" cargas ("+buff.accumulator+") para mejorar "+
       stats.join(", ")+" ×"+factor.toFixed(2)+
       " durante "+buff.durationTurns+" turnos."}],
 };
}
