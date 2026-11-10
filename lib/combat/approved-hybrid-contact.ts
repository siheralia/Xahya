/**
 * D3.2 — first real dual-channel combat skill: short-range, magic-infused
 * physical CONTACT. The magical force travels in the same confirmed melee
 * contact, NOT as an independently reflected ray or an area spell.
 *
 * Refuse all ambiguous attack shapes, extras, unpriced approvals, and
 * multi-purpose mechanics until their authoritative reaction policy exists.
 */
import {parseSkillArea} from "../skills/area-of-effect.ts";
import {parseConfiguredSkillRange} from "./skill-range.ts";
import type {ModularCutoverMode} from "../effects/modular-cutover.ts";
import {isComposedSkillEffect} from "../skills/composed-effects.ts";

export type ApprovedHybridContact={
 physicalMultiplier:number;magicalMultiplier:number;
 /** D3.4: reviewed hostile rider, activated only by this HP damage channel. */
 statusChannel?:"PHYSICAL"|"MAGICAL";
 /** D3.5: a reviewed IMPACT/CHARACTER rider needs actual bodily CONTACT,
  * even when damage is completely mitigated. Defaults to HP_DAMAGE. */
 statusGate?:"CONTACT";
 /** D3.6: minimum HP truly lost from the reviewed trigger channel.
  * Omitted means 1 HP, preserving all previously approved skills. */
 statusMinimumHp?:number;
};
const isObject=(v:unknown):v is Record<string,unknown> =>
 v!==null&&typeof v==="object"&&!Array.isArray(v);
const error=(s:string):never=>{throw new Error(s);};

export function hasHybridDamageChannels(effects:readonly unknown[]):boolean {
 const targets=new Set(effects.filter(isObject)
  .filter(e=>e.type==="DAMAGE_MULTIPLIER").map(e=>String(e.target)));
 return (targets.has("PHYSICAL_ATTACK")||targets.has("PHYS_ATK"))&&
  (targets.has("MAGIC_ATTACK")||targets.has("MAGIC_ATK"));
}

export function compileApprovedHybridContact(
 row:Record<string,unknown>,cutover:ModularCutoverMode,
):ApprovedHybridContact {
 if(cutover==="LEGACY_ONLY")
  return error("Las técnicas híbridas están desactivadas en el modo de seguridad anterior.");
 if(row.category!=="OFFENSIVE"||row.status!=="APPROVED"||
    row.approvedAt==null||!Number.isSafeInteger(row.pchCost)||Number(row.pchCost)<1)
  return error("La técnica híbrida necesita aprobación y PCH revisado.");
 if(!Number.isSafeInteger(row.cost)||Number(row.cost)<1||Number(row.cost)>1000000||
    Number(row.maintenanceCost??0)!==0||
    Number(row.accumulationCost??0)!==0||
    Number(row.accumulationPerTick??0)!==0)
  return error("La técnica híbrida necesita maná de activación sin mantenimiento ni acumulación.");
 if(typeof row.condition==="string"&&row.condition.trim())
  return error("Las condiciones narrativas aún no tienen resolutor para híbridos.");
 if(row.attackType!=="BLUNT")
  return error("La primera técnica híbrida necesita un golpe contundente de contacto.");
 const area=parseSkillArea(row.areaOfEffect);
 const range=parseConfiguredSkillRange(row.areaOfEffect);
 if(area.kind!=="CONTACT"||range.rangeMeters===null||
    !Number.isSafeInteger(range.rangeMeters)||range.rangeMeters<1||range.rangeMeters>2)
  return error("La técnica híbrida requiere contacto explícito de 1 o 2 m.");
 if(row.mechanics!==undefined&&row.mechanics!==null&&!isObject(row.mechanics))
  return error("Las mecánicas híbridas deben ser un objeto revisado.");
 const mechanics=isObject(row.mechanics)?row.mechanics:{};
 // Shared editors may persist inert metadata/empty rule arrays. Do not
 // treat them as executable actions, but reject any nonempty advanced rule.
 if(Object.keys(mechanics).some(k=>![
   "parentSkillId","family","activationConditions","rules",
   "variableResistance","hybridStatusChannel","hybridStatusMinimumHp",
 ].includes(k))||
    (mechanics.family!==undefined&&
      (typeof mechanics.family!=="string"||mechanics.family.length>80))||
    (mechanics.activationConditions!==undefined&&
      (!Array.isArray(mechanics.activationConditions)||mechanics.activationConditions.length>0))||
    (mechanics.rules!==undefined&&
      (!Array.isArray(mechanics.rules)||mechanics.rules.length>0))||
    mechanics.variableResistance!=null)
  return error("La técnica híbrida no admite mecánicas adicionales.");
 const effects=row.effect;
 if(!Array.isArray(effects)||![2,3].includes(effects.length)||!effects.every(isObject))
  return error("El golpe imbuido requiere dos canales y, opcionalmente, un estado aprobado.");
 const composed=effects.filter(isComposedSkillEffect);
 if(composed.length>1||effects.length!==2+composed.length)
  return error("El golpe imbuido admite un único debilitamiento modular adicional.");
 const statusChannel=mechanics.hybridStatusChannel;
 const minimum=mechanics.hybridStatusMinimumHp;
 if(minimum!==undefined&&(!Number.isSafeInteger(minimum)||
    Number(minimum)<1||Number(minimum)>20))
  return error("El umbral del estado híbrido debe ser un entero de 1 a 20 HP.");
 const module=composed.length===1?composed[0].module:null;
 const contactRider=module?.trigger==="IMPACT";
 if(contactRider&&(module?.impactKind!=="CHARACTER"||
    module.requirements!==undefined))
  return error("Un estado de contacto exige impacto contra personaje, sin condiciones adicionales.");
 if(module&&module.trigger!=="ACTIVATE"&&!contactRider)
  return error("El estado híbrido solo admite activación por daño o impacto real contra personaje.");
 if(composed.length===1&&!contactRider&&
    !["PHYSICAL","MAGICAL"].includes(String(statusChannel)))
  return error("Selecciona el canal físico o mágico que debe causar daño real para activar el estado.");
 if(contactRider&&statusChannel!==undefined)
  return error("Un efecto por contacto no puede fingir requerir daño de un canal.");
 if(contactRider&&minimum!==undefined)
  return error("Un efecto de contacto no puede exigir un mínimo de daño HP.");
 if(composed.length===0&&(statusChannel!==undefined||minimum!==undefined))
  return error("Un umbral o canal activador requiere un estado modular aprobado.");
 const channel=new Map<"PHYSICAL"|"MAGICAL",number>();
 for(const e of effects.filter(e=>!isComposedSkillEffect(e)) as Record<string,unknown>[]){
  if(Object.keys(e).some(k=>!["type","target","value"].includes(k))||
     e.type!=="DAMAGE_MULTIPLIER")
   return error("El golpe imbuido solo admite dos módulos de daño independientes.");
  const kind=["PHYSICAL_ATTACK","PHYS_ATK"].includes(String(e.target))?"PHYSICAL":
   ["MAGIC_ATTACK","MAGIC_ATK"].includes(String(e.target))?"MAGICAL":null;
  if(!kind||channel.has(kind)||!Number.isSafeInteger(e.value)||
     Number(e.value)<25||Number(e.value)>75)
   return error("Cada canal del golpe imbuido debe tener entre 25 y 75 % de potencia.");
  channel.set(kind,Number(e.value));
 }
 const physical=channel.get("PHYSICAL"),magical=channel.get("MAGICAL");
 if(physical===undefined||magical===undefined||physical+magical!==100)
  return error("El golpe imbuido debe repartir exactamente el 100 % entre físico y mágico.");
 const duration=String(row.duration??"").trim();
 if(composed.length===0&&!["Instantánea","Instantanea","0 turnos","0 turno"].includes(duration))
  return error("Sin estado, el golpe híbrido debe ser instantáneo.");
 if(composed.length===1&&!/^[1-5] turnos?$/.test(duration))
  return error("Con debilitamiento, la duración del estado híbrido debe ser de 1 a 5 turnos.");
 return {physicalMultiplier:physical/100,magicalMultiplier:magical/100,
  ...(contactRider?{statusGate:"CONTACT" as const}:{}),
  ...(composed.length===1&&!contactRider?
   {statusChannel:statusChannel as "PHYSICAL"|"MAGICAL",
    ...(minimum!==undefined?{statusMinimumHp:Number(minimum)}:{})}:{})};
}
