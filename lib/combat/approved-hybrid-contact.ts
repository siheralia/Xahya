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

export type ApprovedHybridContact={
 physicalMultiplier:number;magicalMultiplier:number;
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
 const mechanics=isObject(row.mechanics)?row.mechanics:{};
 if(Object.keys(mechanics).some(k=>k!=="parentSkillId"))
  return error("La técnica híbrida no admite mecánicas adicionales.");
 const effects=row.effect;
 if(!Array.isArray(effects)||effects.length!==2||!effects.every(isObject))
  return error("El golpe imbuido necesita exactamente dos módulos de daño.");
 const channel=new Map<"PHYSICAL"|"MAGICAL",number>();
 for(const e of effects as Record<string,unknown>[]){
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
 if(!["Instantánea","Instantanea","0 turnos","0 turno"].includes(String(row.duration??"").trim()))
  return error("La técnica híbrida inicial debe ser instantánea.");
 return {physicalMultiplier:physical/100,magicalMultiplier:magical/100};
}
