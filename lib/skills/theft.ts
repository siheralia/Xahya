import {canCopySkill,copySkillSnapshot,type CopyEffect} from "@/lib/skills/copy";

import {requiredTheftPch,validateTheftEffect} from "@/lib/skills/theft-pricing";
export {requiredTheftPch,validateTheftEffect,SKILL_THEFT_COMPLEXITY_MULTIPLIER} from "@/lib/skills/theft-pricing";

export type TheftEffect=CopyEffect & {
  type:"STEAL_SKILL";
  stealDurationTurns?:number;
  stealCapacity?:number;
  stealFidelityPercent?:number;
  stealAllowSpecial?:boolean;
  stealAllowRacial?:boolean;
};
export function canStealSkill(effect:TheftEffect,original:{pchCost?:number;effect?:unknown;grantedByRacePerkId?:number|null;grantedByRaceSkillId?:number|null},sourceComplexity:number):string|null{
  const invalid=validateTheftEffect(effect);
  if(invalid)return invalid;
  if(requiredTheftPch(sourceComplexity)>Number(effect.value))return "La habilidad requiere el doble de su complejidad en PCH para robarla.";
  const copyRule:CopyEffect={
    type:"COPY_SKILL",value:Number(effect.value),copyMode:"TEMPORARY",
    copyAllowSpecial:effect.stealAllowSpecial!==false,
    copyAllowRacial:effect.stealAllowRacial===true
  };
  return canCopySkill(copyRule,{...original,pchCost:sourceComplexity},"TEMPORARY");
}
export function snapshotStolenSkill<T extends {effect:unknown;name:string}>(source:T,effect:TheftEffect){
  return copySkillSnapshot(source,{type:"COPY_SKILL",copyFidelityPercent:effect.stealFidelityPercent??100});
}
