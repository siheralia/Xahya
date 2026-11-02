import {canCopySkill,copySkillSnapshot,type CopyEffect} from "@/lib/skills/copy";

/** Robbing requires double the source's undiscounted PCH complexity. */
export const SKILL_THEFT_COMPLEXITY_MULTIPLIER=2;

export type TheftEffect=CopyEffect & {
  type:"STEAL_SKILL";
  stealDurationTurns?:number;
  stealCapacity?:number;
  stealFidelityPercent?:number;
  stealAllowSpecial?:boolean;
  stealAllowRacial?:boolean;
};
export function requiredTheftPch(sourceComplexity:number):number{
  if(!Number.isFinite(sourceComplexity)||sourceComplexity<0)throw new Error("Complejidad inválida.");
  return Math.ceil(sourceComplexity*SKILL_THEFT_COMPLEXITY_MULTIPLIER);
}
export function validateTheftEffect(effect:{type:string;value?:number;stealDurationTurns?:number;stealCapacity?:number;stealFidelityPercent?:number;stealAllowSpecial?:boolean;stealAllowRacial?:boolean}):string|null{
  if(effect.type!=="STEAL_SKILL")return null;
  if(!Number.isSafeInteger(effect.value)||Number(effect.value)<1||Number(effect.value)>1000000)return "Capacidad de robo inválida (1–1000000 PCH).";
  if(effect.stealDurationTurns!==undefined&&(!Number.isSafeInteger(effect.stealDurationTurns)||effect.stealDurationTurns<1||effect.stealDurationTurns>100))return "Duración de robo inválida (1–100 turnos).";
  if(effect.stealCapacity!==undefined&&(!Number.isSafeInteger(effect.stealCapacity)||effect.stealCapacity<1||effect.stealCapacity>100))return "Capacidad simultánea de robo inválida.";
  if(effect.stealFidelityPercent!==undefined&&(!Number.isSafeInteger(effect.stealFidelityPercent)||effect.stealFidelityPercent<1||effect.stealFidelityPercent>100))return "Fidelidad de robo inválida.";
  if(effect.stealAllowSpecial!==undefined&&typeof effect.stealAllowSpecial!=="boolean")return "Restricción de especiales inválida.";
  if(effect.stealAllowRacial!==undefined&&typeof effect.stealAllowRacial!=="boolean")return "Restricción de raciales inválida.";
  return null;
}
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
