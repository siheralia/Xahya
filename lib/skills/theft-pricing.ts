/** Temporary theft costs twice as much ability capacity as copying the same original. */
export const SKILL_THEFT_COMPLEXITY_MULTIPLIER=2;
export function requiredTheftPch(sourceComplexity:number):number{
  if(!Number.isFinite(sourceComplexity)||sourceComplexity<0)throw new Error("Complejidad inválida.");
  return Math.ceil(sourceComplexity*SKILL_THEFT_COMPLEXITY_MULTIPLIER);
}
export function validateTheftEffect(effect:{type:string;value?:number;stealDurationTurns?:number;stealCapacity?:number;stealFidelityPercent?:number;stealAllowSpecial?:boolean;stealAllowRacial?:boolean;stealBodyCoercion?:boolean}):string|null{
  if(effect.type!=="STEAL_SKILL")return null;
  if(!Number.isSafeInteger(effect.value)||Number(effect.value)<1||Number(effect.value)>1000000)return "Capacidad de robo inválida (1–1000000 PCH).";
  if(effect.stealDurationTurns!==undefined&&(!Number.isSafeInteger(effect.stealDurationTurns)||effect.stealDurationTurns<1||effect.stealDurationTurns>100))return "Duración de robo inválida (1–100 turnos).";
  if(effect.stealCapacity!==undefined&&(!Number.isSafeInteger(effect.stealCapacity)||effect.stealCapacity<1||effect.stealCapacity>100))return "Capacidad simultánea de robo inválida.";
  if(effect.stealFidelityPercent!==undefined&&(!Number.isSafeInteger(effect.stealFidelityPercent)||effect.stealFidelityPercent<1||effect.stealFidelityPercent>100))return "Fidelidad de robo inválida.";
  if(effect.stealBodyCoercion!==undefined&&typeof effect.stealBodyCoercion!=="boolean")return "Coerción corporal inválida.";
  if(effect.stealAllowSpecial!==undefined&&typeof effect.stealAllowSpecial!=="boolean")return "Restricción de especiales inválida.";
  if(effect.stealAllowRacial!==undefined&&typeof effect.stealAllowRacial!=="boolean")return "Restricción de raciales inválida.";
  return null;
}
