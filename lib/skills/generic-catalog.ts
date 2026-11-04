import {normalizeSkillArea} from "@/lib/skills/area-of-effect";
import {priceUpgrade, type UpgradePayload} from "@/lib/skills/upgrade";
import type {SkillMechanics} from "@/lib/skills/interaction-engine";
import {validateSkillCombatTypes} from "@/lib/combat/matchup-types";

export const GENERIC_ELEMENT_PLACEHOLDER = "$ELEMENT";
export type GenericSkillTemplateRow = {
  id:number; name:string; description?:string|null; parentTemplateId?:number|null;
  payload:Record<string,any>; elementChoice:boolean; enabled:boolean;
};
export type GenericResolvedSkill = UpgradePayload & {mechanics:SkillMechanics};
const array=(v:unknown):any[]=>Array.isArray(v)?v:[];
const mechanics=(v:unknown):SkillMechanics=>v&&typeof v==="object"&&!Array.isArray(v)?v as SkillMechanics:{};
const validId=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const asObject=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};

export function genericTemplateChain(rows:readonly GenericSkillTemplateRow[], id:number):GenericSkillTemplateRow[] {
  if(!validId(id))throw new Error("Plantilla inválida.");
  const visited=new Set<number>(),chain:GenericSkillTemplateRow[]=[];
  let current:number|null=id;
  while(current!==null){
    if(visited.has(current)||chain.length>12)throw new Error("Hay un ciclo o demasiados niveles de herencia.");
    visited.add(current);
    const row=rows.find(r=>Number(r.id)===current);
    if(!row)throw new Error("La plantilla base no existe.");
    chain.unshift(row);
    current=row.parentTemplateId==null?null:Number(row.parentTemplateId);
  }
  return chain;
}

export function validateGenericTemplateSettings(
  row:Pick<GenericSkillTemplateRow,"name"|"description"|"payload"|"elementChoice"|"parentTemplateId">,
  hasParent:boolean,
):string|null {
  if(typeof row.name!=="string"||!row.name.trim()||row.name.length>120)return "Nombre genérico inválido.";
  if(row.description!=null && (typeof row.description!=="string"||row.description.length>5000))return "Descripción inválida.";
  if(!row.payload||typeof row.payload!=="object"||Array.isArray(row.payload))return "Configuración genérica inválida.";
  const payload=row.payload;
  const combatTypeError=validateSkillCombatTypes(payload);
  if(combatTypeError)return combatTypeError;
  if(!Array.isArray(payload.effect)||payload.effect.length>20) return "La plantilla necesita una lista de efectos válida.";
  if(!hasParent && payload.effect.length===0 && !mechanics(payload.mechanics).variableResistance && !array(mechanics(payload.mechanics).rules).length)return "La habilidad genérica base necesita al menos un efecto o mecánica.";
  if(hasParent && payload.effect.length===0 && !array(mechanics(payload.mechanics).rules).length && !mechanics(payload.mechanics).variableResistance)
    return "La especialización debe añadir efectos o mecánicas.";
  if(typeof row.elementChoice!=="boolean")return "Selección elemental inválida.";
  const imbues=array(payload.effect).filter(e=>e?.type==="ELEMENTAL_IMBUE");
  if(row.elementChoice&&!imbues.length)return "Añade el efecto Imbuir elemento para permitir elegir elemento.";
  if(row.elementChoice && imbues.some(e=>e.element!==GENERIC_ELEMENT_PLACEHOLDER)) return "La opción elemental requiere el marcador de elección en Imbuir elemento.";
  if(!row.elementChoice&&array(payload.effect).some(e=>e?.element===GENERIC_ELEMENT_PLACEHOLDER))
    return "Solo las plantillas con selección elemental pueden usar un elemento variable.";
  if(array(payload.effect).some(e=>!e||typeof e!=="object"))return "Efectos genéricos inválidos.";
  const ownMechanics=mechanics(payload.mechanics);
  if(ownMechanics.parentSkillId||array(ownMechanics.rules).some(r=>r?.linkedSkillId))
    return "Los vínculos de una plantilla genérica no pueden apuntar a habilidades de un personaje.";
  if(row.parentTemplateId!=null&&!validId(row.parentTemplateId))return "Plantilla base inválida.";
  return null;
}

export function resolveGenericSkill(
  rows:readonly GenericSkillTemplateRow[], id:number, chosenElement?:string,
):{chain:GenericSkillTemplateRow[];skill:GenericResolvedSkill; requiresElement:boolean} {
  const chain=genericTemplateChain(rows,id);
  let combined:Record<string,any>={};
  let effect:any[]=[],requirements:any[]=[],rules:any[]=[],activationConditions:any[]=[];
  let combinedMechanics:SkillMechanics={};
  for(const template of chain) {
    const piece=asObject(template.payload);
    const ownMechanics=mechanics(piece.mechanics);
    combined={...combined,...piece};
    effect=[...effect,...array(piece.effect)];
    requirements=[...requirements,...array(piece.effectRequirements)];
    rules=[...rules,...array(ownMechanics.rules)];
    activationConditions=[...activationConditions,...array(ownMechanics.activationConditions)];
    combinedMechanics={...combinedMechanics,...ownMechanics};
  }
  const requiresElement=chain.some(r=>r.elementChoice);
  if(requiresElement && (!chosenElement||chosenElement==="NEUTRAL"))
    throw new Error("Selecciona un elemento no neutro.");
  // Effect and mechanic inheritance is additive, other attributes are the latest template's values.
  const leaf=chain[chain.length-1];
  const seen=new Set<string>();
  requirements=requirements.filter(r=>{
    const key=String(r?.effect)+"|"+String(r?.element??"");
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  const resolveElement=(v:string|undefined)=>v===GENERIC_ELEMENT_PLACEHOLDER?chosenElement:v;
  effect=effect.map(e=>({...e,element:resolveElement(e.element)}));
  // A generic template's rules cannot contain specific character skill IDs.
  const result={...combined,
    name:leaf.name,
    description:leaf.description||combined.description||"",
    effect,
    effectRequirements:requirements,
    mechanics:{...combinedMechanics,rules,activationConditions},
  } as GenericResolvedSkill;
  return {chain,skill:result,requiresElement};
}

export async function quoteGenericSkill(
  rows:readonly GenericSkillTemplateRow[], id:number, chosenElement?:string,
):Promise<{pchCost:number;totalPch:number;parentTotalPch:number;skill:GenericResolvedSkill;parentTemplateId:number|null;requiresElement:boolean}> {
  const resolved=resolveGenericSkill(rows,id,chosenElement);
  const leaf=resolved.chain.at(-1)!;
  const full=await priceUpgrade(resolved.skill);
  const parent=resolved.chain.length>1
    ? await priceUpgrade(resolveGenericSkill(rows,resolved.chain.at(-2)!.id,chosenElement).skill)
    : null;
  const extra=full.pch-(parent?.pch??0);
  if(!Number.isSafeInteger(extra)||extra<1)
    throw new Error("La especialización debe incrementar el valor total de la habilidad al menos 1 PCH.");
  return {
    pchCost:extra,totalPch:full.pch,parentTotalPch:parent?.pch??0,
    skill:{...full.payload,mechanics:resolved.skill.mechanics},
    parentTemplateId:leaf.parentTemplateId??null,
    requiresElement:resolved.requiresElement,
  };
}

/** Transforms only the current template's new imbuement effects into element slots. */
export function normalizeGenericPayload(input:unknown,elementChoice:boolean):Record<string,any>{
  const payload=asObject(input);
  const normalized={...payload,areaOfEffect:normalizeSkillArea(payload.areaOfEffect),effect:array(payload.effect).map(effect=>{
    const row={...effect};
    if(elementChoice && row.type==="ELEMENTAL_IMBUE") row.element=GENERIC_ELEMENT_PLACEHOLDER;
    return row;
  })};
  return normalized;
}

/**
 * Evolving an owned generic skill preserves any approved custom improvements
 * previously applied to its actual snapshot instead of replacing them with
 * the current template base. Only the new specialization's delta is appended.
 */
export function evolveGenericSkillSnapshot(
  owned:{effect?:unknown; effectRequirements?:unknown; mechanics?:unknown},
  leaf:GenericSkillTemplateRow, quoted:GenericResolvedSkill, selectedElement?:string,
):GenericResolvedSkill {
  const delta=asObject(leaf.payload);
  const extra=array(delta.effect).map(e=>({
    ...e,element:e.element===GENERIC_ELEMENT_PLACEHOLDER?selectedElement:e.element,
  }));
  const ownEffects=array(owned.effect);
  const baseMechanics=mechanics(owned.mechanics);
  const extraMechanics=mechanics(delta.mechanics);
  const merged={
    ...quoted,
    effect:[...ownEffects,...extra],
    effectRequirements:[...array(owned.effectRequirements),...array(delta.effectRequirements)],
    mechanics:{...baseMechanics,...extraMechanics,
      rules:[...array(baseMechanics.rules),...array(extraMechanics.rules)],
      activationConditions:[...array(baseMechanics.activationConditions),...array(extraMechanics.activationConditions)],
    },
  } as GenericResolvedSkill;
  if(merged.effect.length>20||array(merged.mechanics.rules).length>12)
    throw new Error("La habilidad personalizada supera los límites de efectos o reglas al evolucionar.");
  return merged;
}
