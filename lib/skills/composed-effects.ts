import {validateEffectContainers,type EffectContainer} from "../effects/micro-modules.ts";
import {pricedMicroStepCount,microRestrictionQuote} from "./micro-restriction-pricing.ts";

/** Standalone modular effect attached directly to a skill, never an approved catalog entry. */
export const COMPOSED_EFFECT_TYPE="COMPOSED";
export const MODULE_DEPOSIT_PER_STEP=5;
/** Reading values and evaluating formulas are connectors, not independent effects.
 * They do not increase the provisional reservation merely by making the
 * previously implicit arithmetic visible as nodes. */
export function pricedModularStepCount(effect:EffectContainer):number{
  return pricedMicroStepCount(effect);
}
/** Minimum reservation only. Real utility/PCH research and staff review decide the final price. */
export type ComposedSkillEffect={
  type:"COMPOSED"; module:EffectContainer;
  /** Player-provided rationale, NOT an authoritative price. */
  pricingNotes?:string;
  /** Admin-assigned final base cost; only management approval can set this. */
  reviewedPch?:number;
  /** Set ONLY by staff approval, v1 discount contract. Older approvals remain unchanged. */
  restrictionPricing?: "V1";
};
export function isComposedSkillEffect(row:unknown):row is ComposedSkillEffect {
  return !!row&&typeof row==="object"&&!Array.isArray(row)
    &&(row as Record<string,unknown>).type===COMPOSED_EFFECT_TYPE;
}
export function validateComposedSkillEffect(row:unknown,scope:"PLAYER"|"REVIEW"):string|null {
  if(!isComposedSkillEffect(row))return "Tipo de efecto modular inválido.";
  const r=row as unknown as Record<string,unknown>;
  if(Object.keys(r).some(k=>!["type","module","pricingNotes","reviewedPch","restrictionPricing"].includes(k)))return "Campos modulares desconocidos.";
  const module=r.module;
  const err=validateEffectContainers([module as EffectContainer]);
  if(err)return err;
  if(pricedModularStepCount(module as EffectContainer)===0)
    return "Un efecto modular necesita al menos una acción; las fuentes y cálculos por sí solos no conceden habilidades.";
  if(typeof r.pricingNotes!=="undefined"&&(typeof r.pricingNotes!=="string"||r.pricingNotes.length>1500))
    return "Justificación modular inválida.";
  if(scope==="PLAYER"&&(r.reviewedPch!==undefined||r.restrictionPricing!==undefined))
    return "El PCH aprobado y el descuento revisado solo puede asignarlos administración.";
  if(r.restrictionPricing!==undefined&&r.restrictionPricing!=="V1")
    return "Versión de descuento modular desconocida.";
  if(scope==="REVIEW" && (typeof r.reviewedPch!=="number" || !Number.isSafeInteger(r.reviewedPch)
    || r.reviewedPch<1 || r.reviewedPch>100000))return "Asigna un PCH revisado válido a cada efecto modular.";
  if(scope==="REVIEW" &&
    Number(r.reviewedPch)<Math.max(1,pricedModularStepCount(module as EffectContainer)*MODULE_DEPOSIT_PER_STEP))
    return "El PCH revisado no puede ser inferior a la reserva mínima de los micromódulos.";
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
/** Mark new approvals without repricing legacy APPROVED skill records on read. */
export function stampReviewedRestrictionPricing(rows:unknown[]):unknown[]{
 return rows.map(row=>isComposedSkillEffect(row)?
  {...row,restrictionPricing:"V1"}:row);
}

/** The preview is tolerant of a half-edited graph; server pricing is not. */
export function previewComposedEffectBasePch(
 row:ComposedSkillEffect,options?:{forApproval?:boolean},
):{amount:number;error:string|null}{
 const module=row.module;
 const error=validateEffectContainers([module]);
 const gross=row.reviewedPch??Math.max(1,pricedModularStepCount(module)*MODULE_DEPOSIT_PER_STEP);
 const candidate=error?gross:(
   row.reviewedPch===undefined||row.restrictionPricing==="V1"||options?.forApproval
   ?microRestrictionQuote(module,gross).finalPch:gross);
 const amount=Number.isSafeInteger(candidate)&&candidate>0&&candidate<=100000?candidate:1;
 return {amount,error:error??(!Number.isSafeInteger(candidate)||candidate<1||candidate>100000?"PCH modular inválido.":null)};
}
export function composedEffectBasePch(row:ComposedSkillEffect):number {
 const err=validateEffectContainers([row.module]);
 if(err)throw new Error(err);
 const gross=row.reviewedPch??Math.max(1,pricedModularStepCount(row.module)*MODULE_DEPOSIT_PER_STEP);
 if(!Number.isSafeInteger(gross)||gross<1||gross>100000)throw new Error("PCH modular inválido.");
 if(row.reviewedPch!==undefined &&
   gross<Math.max(1,pricedModularStepCount(row.module)*MODULE_DEPOSIT_PER_STEP))
   throw new Error("El PCH revisado no puede ser inferior a la reserva modular.");
 return row.reviewedPch===undefined||row.restrictionPricing==="V1"
   ?microRestrictionQuote(row.module,gross).finalPch:gross;
}
export function composedDepositPch(row:ComposedSkillEffect):number {
 if(row.reviewedPch!==undefined||row.restrictionPricing!==undefined)
   throw new Error("El precio o descuento revisado no es válido al enviar una habilidad.");
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
