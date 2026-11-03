import {validateVariableResistance,type VariableResistance} from "../skills/variable-resistance.ts";
import type {Point,Side} from "./turn-engine.ts";

export type ConstructionForm="FIELD"|"BLOCK"|"DECOR"|"MIRROR";
export type ConstructionPlan={material:string;label:string};
export type CombatConstruction={
 id:string;owner:Side;sourceSkillId:number;material:string;
 form:ConstructionForm;label:string;center:Point;createdRound:number;
 /** A cosmetic construction cannot intercept attacks or affect stats. */
 tangible:boolean;durability?:number;hitCount?:number;
 /** A mirror acts independently once per round and reflects only incoming magic. */
 mirror?:{rayMultiplier:number;reflectionMultiplier:number;rangeMeters:number;attackType:"PIERCE";};
 passive?:{sourceSkillId:number;resistance:VariableResistance};
};
const MATERIAL=/^[A-Z][A-Z0-9_]{0,63}$/;
export function creationPlanFromEffect(effect:unknown):ConstructionPlan|null {
 if(!effect||typeof effect!=="object"||Array.isArray(effect))return null;
 const e=effect as Record<string,unknown>;
 if(e.type!=="NARRATIVE"||e.capability!=="CREATE"||typeof e.element!=="string")return null;
 const material=e.element.trim().toUpperCase();
 if(!MATERIAL.test(material))throw new Error("Elemento de construcción inválido.");
 return {material,label:material==="LIGHT"?"Objeto de luz":material==="EARTH"?"Arena":"Construcción de "+material};
}
/** Discover an approved, attached passive from configuration; never hardcode
 * Sikatā's name/ID. The explicit parent and activation condition must match.
 */
export function attachedCreationPassive(sourceSkillId:number,skills:ReadonlyArray<Record<string,unknown>>):
 {sourceSkillId:number;resistance:VariableResistance}|undefined {
 for(const skill of skills){
  if(skill.status!=="APPROVED"||skill.category!=="PASSIVE")continue;
  const mechanics=(skill.mechanics&&typeof skill.mechanics==="object"&&!Array.isArray(skill.mechanics))
   ?skill.mechanics as Record<string,unknown>:{};
  if(Number(mechanics.parentSkillId)!==sourceSkillId)continue;
  const conditions=Array.isArray(mechanics.activationConditions)?mechanics.activationConditions:[];
  if(!conditions.some(c=>c&&typeof c==="object"&&
   (c as Record<string,unknown>).kind==="SKILL_ACTIVE"&&Number((c as Record<string,unknown>).skillId)===sourceSkillId))continue;
  if(!mechanics.variableResistance||validateVariableResistance(mechanics.variableResistance))continue;
  return {sourceSkillId:Number(skill.id),resistance:mechanics.variableResistance as VariableResistance};
 }
 return undefined;
}
export function validateConstructionPlacement(raw:unknown):Point {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Selecciona dónde colocar la construcción.");
 const p=raw as Record<string,unknown>;
 if(typeof p.x!=="number"||typeof p.y!=="number"||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
  p.x<0||p.x>1||p.y<0||p.y>1)throw new Error("Posición de construcción inválida.");
 return {x:p.x,y:p.y};
}
export function resolveConstructionForm(material:string,requested:unknown,hasField:boolean):ConstructionForm {
 const form=requested??(material==="LIGHT"?"DECOR":"FIELD");
 if(!["FIELD","BLOCK","DECOR"].includes(String(form)))throw new Error("Forma de construcción inválida.");
 if(material==="MIRROR"&&form!=="MIRROR")throw new Error("El espejo requiere su forma propia.");
 if(material==="LIGHT"&&form!=="DECOR")throw new Error("Los objetos de luz de esta habilidad son decorativos.");
 if(form==="BLOCK"&&!hasField)throw new Error("Debes crear primero el campo de material.");
 if(form==="DECOR"&&material!=="LIGHT")throw new Error("La construcción de este material no es decorativa.");
 return form as ConstructionForm;
}
