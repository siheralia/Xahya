import {mechanicsPchCost} from "@/lib/skills/mechanics-pricing";
import {manaAdjustedPch} from "@/lib/skills/mana-pricing";
import {applyRangePch} from "@/lib/skills/range-pricing";
import {applyCooldownPch} from "@/lib/skills/cooldown";
import {effectRequirementDiscount,type EffectRequirement} from "@/lib/skills/effect-requirements";
import type {SkillMechanics} from "@/lib/skills/interaction-engine";

/** A client-side quote which mirrors the *resolved* template sent to priceUpgrade.
 * The server always recalculates the authoritative price on save/purchase.
 */
type Template = {
 id:number; parentTemplateId:number|null; totalPch:number|null;
 payload:Record<string,any>;
};
type Editable = {
 effect:ReadonlyArray<{type:string;value?:number;[key:string]:unknown}>;
 effectRequirements:EffectRequirement[];
 mechanics:SkillMechanics;
 cost:number;speed:string;maxRangeMeters:number;cooldown?:string;duration?:string;category?:string;
};
export type GenericPricePreview = {
 total:number; base:number;manaAdjusted:number;beforeRequirements:number;afterCooldown:number;
 baseline?:number;additional:number;
};

export function calculateGenericPricePreview(
 form:Editable,parentId:number|null,templates:ReadonlyArray<Template>,
 priceEffect:(effect:Editable["effect"][number])=>number,
):GenericPricePreview {
 const chain:Template[]=[];
 const visited=new Set<number>();
 let current=parentId;
 while(current!==null){
  if(visited.has(current)||chain.length>12)throw new Error("La jerarquía de habilidades genéricas es inválida.");
  visited.add(current);
  const template=templates.find(x=>x.id===current);
  if(!template)throw new Error("No se encontró la plantilla base.");
  chain.unshift(template);
  current=template.parentTemplateId;
 }
 const parent=parentId===null?null:templates.find(x=>x.id===parentId);
 if(parent && (parent.totalPch===null || !Number.isSafeInteger(parent.totalPch)))
  throw new Error("El precio de la habilidad base no está disponible.");
 const effects=[...chain.flatMap(t=>Array.isArray(t.payload.effect)?t.payload.effect:[]),...form.effect];
 if(!effects.length && !form.mechanics?.variableResistance && !(form.mechanics?.rules?.length))throw new Error("Agrega un efecto o mecánica para calcular los PCH.");
 const requirements=[...chain.flatMap(t=>Array.isArray(t.payload.effectRequirements)?t.payload.effectRequirements:[]),...form.effectRequirements];
 const distinctRequirements=requirements.filter((r,i,a)=>a.findIndex(x=>x.effect===r.effect&&(x.element??"")===(r.element??""))===i);
 let combined:SkillMechanics={};
 const rules:any[]=[];
 const activationConditions:any[]=[];
 for(const m of [...chain.map(t=>t.payload.mechanics??{}),form.mechanics??{}]){
  Object.assign(combined,m);
  if(Array.isArray(m.rules))rules.push(...m.rules);
  if(Array.isArray(m.activationConditions))activationConditions.push(...m.activationConditions);
 }
 combined={...combined,rules,activationConditions};
 const base=effects.reduce((sum,e)=>sum+priceEffect(e),0)+mechanicsPchCost(combined);
 const manaAdjusted=manaAdjustedPch(base,form.cost);
 const beforeRequirements=applyRangePch(manaAdjusted+(!form.speed||form.speed==="DEFAULT"?0:5),form.maxRangeMeters);
 const afterCooldown=applyCooldownPch(beforeRequirements,form.cooldown,form.duration,form.category);
 const total=effectRequirementDiscount(afterCooldown,distinctRequirements);
 return {
  base,manaAdjusted,beforeRequirements,afterCooldown,total,
  ...(parent?{baseline:parent.totalPch!}:{}),
  additional:total-(parent?.totalPch??0),
 };
}
