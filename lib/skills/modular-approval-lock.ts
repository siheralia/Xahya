import {isComposedSkillEffect} from "./composed-effects.ts";

/**
 * D4.3 — a reviewed COMPOSED graph and its surrounding skill form are a single
 * approved price contract. Merely keeping the graph unchanged does not permit
 * a free edit of range, mana, duration, cooldown, or the surrounding mechanics.
 */
export const MODULAR_APPROVAL_FIELDS=[
 "effect","mechanics","effectRequirements","cost","maintenanceCost",
 "accumulationCost","accumulationPerTick","category","duration","cooldown",
 "speed","areaOfEffect","attackType","defenseType","condition","pchCost",
] as const;
type ApprovedField=typeof MODULAR_APPROVAL_FIELDS[number];
type SkillSnapshot=Record<string,unknown>;

const labels:Record<ApprovedField,string>={
 effect:"efectos y conexiones",mechanics:"mecánicas",effectRequirements:"requisitos",
 cost:"maná",maintenanceCost:"mantenimiento",accumulationCost:"acumulación",
 accumulationPerTick:"acumulación por tick",category:"categoría",
 duration:"duración",cooldown:"recuperación",speed:"velocidad",
 areaOfEffect:"área o alcance",attackType:"tipo de ataque",
 defenseType:"tipo de defensa",condition:"condición",pchCost:"PCH",
};

export function hasComposedEffects(value:unknown):boolean{
 return Array.isArray(value)&&value.some(isComposedSkillEffect);
}

/** The comparison ignores JSON key ordering, but never omits a priced field. */
const canonical=(value:unknown):unknown=>{
 if(value===undefined||value===null)return null;
 if(Array.isArray(value))return value.map(canonical);
 if(typeof value==="object"){
  const record=value as Record<string,unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key=>[key,canonical(record[key])]));
 }
 return value;
};

export function modularApprovedEditChanges(
 before:SkillSnapshot,after:SkillSnapshot,
 action:"edit"|"approve"|"reject",
):string[]{
 if(action!=="edit"||before.status!=="APPROVED"||
   !(hasComposedEffects(before.effect)||hasComposedEffects(after.effect)))return [];
 return MODULAR_APPROVAL_FIELDS.filter(field=>
   JSON.stringify(canonical(before[field]))!==JSON.stringify(canonical(after[field]))
 ).map(field=>labels[field]);
}

export function modularApprovedEditError(
 before:SkillSnapshot,after:SkillSnapshot,
 action:"edit"|"approve"|"reject",
):string|null{
 const changes=modularApprovedEditChanges(before,after,action);
 return changes.length
  ?"Esta habilidad modular ya está aprobada. Cambios en "+
    changes.join(", ")+
    ": vuelve a revisar y aprobar su costo PCH completo antes de guardar."
  :null;
}
