import {validateEffectContainers,type EffectContainer} from "../effects/micro-modules.ts";

/** Standalone modular effect attached directly to a skill, never an approved catalog entry. */
export const COMPOSED_EFFECT_TYPE="COMPOSED";
export const MODULE_DEPOSIT_PER_STEP=5;
/** Reading values and evaluating formulas are connectors, not independent effects.
 * They do not increase the provisional reservation merely by making the
 * previously implicit arithmetic visible as nodes. */
export function pricedModularStepCount(effect:EffectContainer):number{
  return effect.steps.filter(step=>!["READ_STAT","READ_STORED","CALCULATE","READ_ITEM","SELECT_TARGET","SELECT_STAT","READ_HP_DAMAGE","READ_STATUSES","REQUIRE_CONTACT"].includes(step.kind)).length;
}
/** Minimum reservation only. Real utility/PCH research and staff review decide the final price. */
export type ComposedSkillEffect={
  type:"COMPOSED"; module:EffectContainer;
  /** Player-provided rationale, NOT an authoritative price. */
  pricingNotes?:string;
  /** Admin-assigned final base cost; only management approval can set this. */
  reviewedPch?:number;
};
export function isComposedSkillEffect(row:unknown):row is ComposedSkillEffect {
  return !!row&&typeof row==="object"&&!Array.isArray(row)
    &&(row as Record<string,unknown>).type===COMPOSED_EFFECT_TYPE;
}
export function validateComposedSkillEffect(row:unknown,scope:"PLAYER"|"REVIEW"):string|null {
  if(!isComposedSkillEffect(row))return "Tipo de efecto modular inválido.";
  const r=row as unknown as Record<string,unknown>;
  if(Object.keys(r).some(k=>!["type","module","pricingNotes","reviewedPch"].includes(k)))return "Campos modulares desconocidos.";
  const module=r.module;
  const err=validateEffectContainers([module as EffectContainer]);
  if(err)return err;
  if(pricedModularStepCount(module as EffectContainer)===0)
    return "Un efecto modular necesita al menos una acción; las fuentes y cálculos por sí solos no conceden habilidades.";
  if(typeof r.pricingNotes!=="undefined"&&(typeof r.pricingNotes!=="string"||r.pricingNotes.length>1500))
    return "Justificación modular inválida.";
  if(scope==="PLAYER"&&r.reviewedPch!==undefined)return "El PCH aprobado solo puede asignarlo administración.";
  if(scope==="REVIEW" && (typeof r.reviewedPch!=="number" || !Number.isSafeInteger(r.reviewedPch)
    || r.reviewedPch<1 || r.reviewedPch>100000))return "Asigna un PCH revisado válido a cada efecto modular.";
  return null;
}
export function validateComposedSkillList(rows:unknown,scope:"PLAYER"|"REVIEW"):string|null {
  if(!Array.isArray(rows)||rows.length>20)return "Cantidad de efectos inválida.";
  const ids=new Set<string>();
  let count=0;
  for(const row of rows) {
    if(!isComposedSkillEffect(row))continue;
    if(++count>8)return "Una habilidad admite como máximo ocho efectos compuestos.";
    const err=validateComposedSkillEffect(row,scope);
    if(err)return err;
    if(ids.has(row.module.id))return "Los efectos compuestos necesitan identificadores distintos.";
    ids.add(row.module.id);
  }
  return null;
}
/** A skill form renders on every keystroke. Invalid intermediate names (for
 * example clearing resistanceBase to rename it) are normal while editing.
 * Return a display-only provisional quote and an explicit validation message.
 * Never use this preview for persisted/approved PCH or server authorization.
 */
export function previewComposedEffectBasePch(row:ComposedSkillEffect):{amount:number;error:string|null}{
  const module=row.module;
  const error=validateEffectContainers([module]);
  const count=module&&Array.isArray(module.steps)
    ?module.steps.filter(step=>step&&typeof step==="object"&&!["READ_STAT","READ_STORED","CALCULATE","READ_ITEM","SELECT_TARGET","SELECT_STAT","READ_HP_DAMAGE","READ_STATUSES","REQUIRE_CONTACT"].includes(step.kind)).length
    :0;
  const candidate=row.reviewedPch??Math.max(1,count*MODULE_DEPOSIT_PER_STEP);
  const amount=Number.isSafeInteger(candidate)&&candidate>0&&candidate<=100000?candidate:1;
  return {amount,error:error??(!Number.isSafeInteger(candidate)||candidate<1||candidate>100000?"PCH modular inválido.":null)};
}
export function composedEffectBasePch(row:ComposedSkillEffect):number {
  const err=validateEffectContainers([row.module]);
  if(err)throw new Error(err);
  const value=row.reviewedPch??Math.max(1,pricedModularStepCount(row.module)*MODULE_DEPOSIT_PER_STEP);
  if(!Number.isSafeInteger(value)||value<1||value>100000)throw new Error("PCH modular inválido.");
  return value;
}
export function composedDepositPch(row:ComposedSkillEffect):number {
  if(row.reviewedPch!==undefined)throw new Error("El precio revisado no es válido al enviar una habilidad.");
  return composedEffectBasePch(row);
}
/** Drop staff-only price fields before the player payload reaches persistence/pricing. */
export function canonicalPlayerComposedEffects(rows:unknown[]):unknown[]{
  const error=validateComposedSkillList(rows,"PLAYER");
  if(error)throw new Error(error);
  return rows.map(row=>isComposedSkillEffect(row)
    ?{type:COMPOSED_EFFECT_TYPE,module:structuredClone(row.module),pricingNotes:row.pricingNotes??""}
    :row);
}
