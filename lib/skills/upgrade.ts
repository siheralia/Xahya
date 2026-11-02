import { validEffectRequirements, effectRequirementDiscount } from "@/lib/skills/effect-requirements";
import { applyRangePch } from "@/lib/skills/range-pricing";
import { manaAdjustedPch } from "@/lib/skills/mana-pricing";
import { speedSurcharge } from "@/lib/skills/speed-settings";
import { durationPchCost } from "@/lib/effects/duration-pricing";
import { calculateSkillPch, defaultEffectPricing } from "@/lib/skills/pch";
import { readEffectPricing } from "@/lib/effects/pricing";
import { readDurationPricing } from "@/lib/effects/duration-pricing-settings";
import { readNarrativeEffectCards } from "@/lib/effects/narrative-cards";
import { EFFECT_TYPES, resolveEffectTargets } from "@/lib/effects/catalog";
import { readStatisticsCatalog } from "@/lib/stats/dynamic";
import { validateSkillParameters } from "@/lib/effects/skill-conditions";
import { validateCopyEffect } from "@/lib/skills/copy";

export type UpgradePayload = {
  name:string; description:string; cost:number; maintenanceCost:number;
  accumulationCost:number; accumulationPerTick:number; duration:string|null;
  category:string; areaOfEffect:string; speed:string; cooldown:string;
  condition:string|null; maxRangeMeters:number;
  effect:Array<{type:string;target?:string;value?:number;description?:string;durationTurns?:number;durationMovements?:number;[key:string]:unknown}>;
  effectRequirements:Array<{effect:string;element?:string}>;
};

export async function priceUpgrade(body:unknown):Promise<{payload:UpgradePayload;pch:number}> {
  if(!body || typeof body!=="object")throw new Error("Datos de mejora inválidos.");
  const b=body as Record<string,any>;
  const effects=Array.isArray(b.effect)?b.effect:[];
  const requirements=b.effectRequirements??[];
  const range=Number(b.maxRangeMeters);
  if (!b.name || typeof b.name!=="string" || b.name.length>120 || !b.description || typeof b.description!=="string" || b.description.length>5000) throw new Error("Nombre o descripción inválidos.");
  if(!["OFFENSIVE","PASSIVE","SUPPORT","UTILITY","BASIC"].includes(b.category))throw new Error("Categoría inválida.");
  if(!Number.isSafeInteger(range)||range<0||range>100)throw new Error("Distancia inválida.");
  if (!Array.isArray(effects)||effects.length<1||effects.length>20)throw new Error("La habilidad debe tener entre 1 y 20 efectos.");
  if(!validEffectRequirements(requirements))throw new Error("Requisitos por efecto inválidos.");
  for (const field of ["cost","maintenanceCost","accumulationCost","accumulationPerTick"])if(!Number.isSafeInteger(b[field])||b[field]<0)throw new Error("Costos inválidos.");
  if(typeof b.speed!=="string"||typeof b.cooldown!=="string")throw new Error("Velocidad o enfriamiento inválidos.");
  const statistics=await readStatisticsCatalog();
  const pricing={...defaultEffectPricing(),...await readEffectPricing()};
  const narrative=await readNarrativeEffectCards();
  const durations=await readDurationPricing();
  let base=0;
  for(const e of effects){
    if(!e || typeof e!=="object" || !EFFECT_TYPES.includes(e.type))throw new Error("Tipo de efecto inválido.");
    const err=validateSkillParameters(e)??validateCopyEffect(e);
    if(err)throw new Error(err);
    const t=Number(e.durationTurns??0),m=Number(e.durationMovements??0);
    if(!Number.isSafeInteger(t)||!Number.isSafeInteger(m)||t<0||m<0||(t&&m)||t>durations.maxTurns||m>(durations.maxMovements??20))throw new Error("Duración inválida.");
    let cost:number;
    if(e.type==="NARRATIVE" && String(e.target??"").startsWith("CARD:")){
      const card=narrative.find(c=>c.id===String(e.target).slice(5));
      if(!card||!card.enabled||e.description!==card.name+": "+card.description)throw new Error("Tarjeta narrativa inválida.");
      cost=card.pch;
    }else{
      if(pricing[e.type]?.enabled===false)throw new Error("Efecto desactivado.");
      const targets=resolveEffectTargets(e.type,statistics);
      if(targets.length && !targets.some(x=>x.key===e.target))throw new Error("Objetivo inválido.");
      if(e.type!=="NARRATIVE" && (!Number.isFinite(e.value)||e.value<=0))throw new Error("Potencia inválida.");
      cost=calculateSkillPch([e],pricing);
    }
    base+=durationPchCost(cost,m?{kind:"MOVEMENTS",movements:m}:t?{kind:"TURNS",turns:t}:{kind:"INSTANT"},durations);
  }
  const pch=effectRequirementDiscount(applyRangePch(manaAdjustedPch(base,b.cost)+speedSurcharge(b.speed),range),requirements);
  if(!Number.isSafeInteger(pch)||pch<1)throw new Error("Costo PCH inválido.");
  return {pch,payload:{
    name:b.name.trim(),description:b.description.trim(),cost:b.cost,
    maintenanceCost:b.maintenanceCost,accumulationCost:b.accumulationCost,
    accumulationPerTick:b.accumulationPerTick,duration:b.duration??null,
    category:b.category,areaOfEffect:String(b.areaOfEffect??"Objetivo único"),
    maxRangeMeters:range,speed:b.speed,cooldown:b.cooldown,
    condition:b.condition??null,effect:effects,effectRequirements:requirements,
  }};
}
