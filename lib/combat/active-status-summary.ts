/**
 * Read-only projection of validated persistent combat statuses for a player.
 * No status is created, priced or activated here. Source data remains the
 * authoritative, transaction-persisted CombatState.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import {equipmentStatLabel} from "./equipment-feedback.ts";

export type ActiveCombatStatusView={
 id:string;source:string;description:string;expiresAtRound:number;
 remainingRounds:number;kind:"BONUS"|"MULTIPLIER";tone:"BUFF"|"DEBUFF";
};

const known=(value:number):boolean=>Number.isFinite(value)&&Math.abs(value)<=1_000_000;
function numberText(n:number):string{
 return new Intl.NumberFormat("es-MX",{maximumFractionDigits:2}).format(n);
}
function sourceForStatus(state:CombatState,sourceSummonId:string):string{
 const summon=state.summons?.find(item=>item.id===sourceSummonId);
 if(summon)return summon.label;
 if(sourceSummonId.startsWith("SKILL:")){
  const id=Number(sourceSummonId.slice(6));
  const event=state.log.slice().reverse().find(item=>item.skillId===id&&item.skillName);
  return event?.skillName??"Habilidad aprobada";
 }
 return "Efecto de combate";
}
/** Only show the requested combatant's current buffs/debuffs. */
export function activeCombatStatusViews(state:CombatState,side:Side):ActiveCombatStatusView[]{
 const output:ActiveCombatStatusView[]=[];
 for(const [index,bonus] of (state.skillBonuses??[]).entries()){
  if(bonus.by!==side||bonus.expiresAtRound<=state.round||
    !known(bonus.value)||bonus.value===0)continue;
  const name=bonus.skillName?.trim()||"Habilidad #"+bonus.skillId;
  output.push({
   id:"SKILL:"+bonus.skillId+":"+index,
   source:name.slice(0,120),
   description:equipmentStatLabel(bonus.stat)+" "+(bonus.value>=0?"+":"")+numberText(bonus.value),
   expiresAtRound:bonus.expiresAtRound,
   remainingRounds:bonus.expiresAtRound-state.round,
   kind:"BONUS",tone:bonus.value>=0?"BUFF":"DEBUFF",
  });
 }
 for(const status of state.summonStatuses??[]){
  if(status.target!==side||status.expiresAtRound<=state.round||
    !known(status.value))continue;
  const multiplier=status.operation==="MULTIPLIER";
  output.push({
   id:"CONTACT:"+status.id,
   source:sourceForStatus(state,status.sourceSummonId),
   description:equipmentStatLabel(status.stat)+
    (multiplier?" ×"+numberText(status.value):
     " "+(status.value>=0?"+":"")+numberText(status.value)),
   expiresAtRound:status.expiresAtRound,
   remainingRounds:status.expiresAtRound-state.round,
   kind:multiplier?"MULTIPLIER":"BONUS",
   tone:multiplier?(status.value<1?"DEBUFF":"BUFF"):
    (status.value<0?"DEBUFF":"BUFF"),
  });
 }
 return output.sort((a,b)=>a.expiresAtRound-b.expiresAtRound).slice(0,100);
}
