/**
 * D2.4 — first enemy status rider, never a free targeted spell.
 * An approved offensive skill must deal real physical or magical damage
 * through the regular combat attack/reaction/collision engine. Its single
 * COMPOSED status is only applied after verified HP loss by the defender.
 */
import {emptyMicroState,executeMicroEvent,validateEffectContainers,
 type EffectContainer} from "../effects/micro-modules.ts";
import {isComposedSkillEffect,validateComposedSkillList}
 from "../skills/composed-effects.ts";
import {parseSkillArea} from "../skills/area-of-effect.ts";
import {parseConfiguredSkillRange} from "./skill-range.ts";
import type {ModularCutoverMode} from "../effects/modular-cutover.ts";

const STATS=new Set(["PHYSICAL_ATTACK","MAGIC_ATTACK","PHYSICAL_DEFENSE",
 "MAGIC_DEFENSE","PRECISION","DODGE"]);
const object=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==="object"&&!Array.isArray(v);
const only=(v:object,keys:readonly string[])=>
 Object.keys(v).every(k=>keys.includes(k));
const error=(message:string):never=>{throw new Error(message);};

export type ApprovedHostileStatus={
 definition:EffectContainer;
 stat:string;
 operation:"BONUS"|"MULTIPLIER";
 value:number;
 durationTurns:number;
 /** The authoritative damage channel selected by the reviewed legacy base. */
 usesMagic:boolean;
};
export type ResolvedHostileStatus=Omit<ApprovedHostileStatus,"definition"|"usesMagic">;

/**
 * Price/policy gate: exactly one 100% physical or magical damage module
 * plus one reviewed COMPOSED selector/status pair. No mixed/hidden steps.
 * The current skill editor/management approval still owns real PCH pricing.
 */
export function compileApprovedHostileStatus(
 row:Record<string,unknown>,cutover:ModularCutoverMode,
):ApprovedHostileStatus{
 if(cutover==="LEGACY_ONLY")
  return error("Los estados hostiles modulares están desactivados en el modo de seguridad anterior.");
 if(row.status!=="APPROVED"||row.approvedAt==null||
    !Number.isSafeInteger(row.pchCost)||Number(row.pchCost)<1||
    row.category!=="OFFENSIVE")
  return error("Un estado hostil necesita una habilidad ofensiva aprobada y PCH revisado.");
 if(!Number.isSafeInteger(row.cost)||Number(row.cost)<1||Number(row.cost)>1000000||
    Number(row.maintenanceCost??0)!==0||
    Number(row.accumulationCost??0)!==0||
    Number(row.accumulationPerTick??0)!==0)
  return error("El ataque con estado requiere maná de activación, sin mantenimiento ni acumulación.");
 if(typeof row.condition==="string"&&row.condition.trim())
  return error("Las condiciones narrativas de esta habilidad aún no tienen resolutor.");
 const mechanics=object(row.mechanics)?row.mechanics:{};
 if(!only(mechanics,["parentSkillId"]))
  return error("El estado hostil no admite mecánicas adicionales.");
 const range=parseConfiguredSkillRange(row.areaOfEffect);
 if(!Number.isSafeInteger(range.rangeMeters)||range.rangeMeters===null||
   range.rangeMeters<1||range.rangeMeters>5||
   !["SINGLE","CONTACT"].includes(parseSkillArea(row.areaOfEffect).kind))
  return error("El estado hostil necesita objetivo único o contacto de hasta 5 m.");
 if(!["CUT","BLUNT","PIERCE"].includes(String(row.attackType)))
  return error("Selecciona corte, golpe contundente o perforación para el ataque.");
 const effects=row.effect;
 if(!Array.isArray(effects)||effects.length!==2)
  return error("El ataque con estado necesita un módulo de daño físico y uno de estado aprobado.");
 const composed=effects.filter(isComposedSkillEffect);
 if(composed.length!==1)return error("El ataque admite un solo efecto COMPOSED de estado.");
 const review=validateComposedSkillList(composed,"REVIEW");
 if(review)return error(review);
 const damage=effects.find(effect=>!isComposedSkillEffect(effect));
 if(!object(damage)||!only(damage,["type","target","value"])||
   damage.type!=="DAMAGE_MULTIPLIER"||
   !["PHYSICAL_ATTACK","PHYS_ATK","MAGIC_ATTACK","MAGIC_ATK"].includes(String(damage.target))||
   damage.value!==100)
  return error("Solo se admite daño físico o mágico aprobado al 100 % como base del estado hostil.");
 const usesMagic=["MAGIC_ATTACK","MAGIC_ATK"].includes(String(damage.target));
 // Magic must travel as a directed, single-target spell. The existing
 // geometry, defender reaction and measured mirror-ray interception apply.
 // Contact-area magic, broad areas and indirect debuffs are not implemented.
 if(usesMagic&&parseSkillArea(row.areaOfEffect).kind!=="SINGLE")
  return error("El debilitamiento mágico requiere un hechizo de objetivo único.");
 const module=structuredClone(composed[0].module);
 const invalid=validateEffectContainers([module]);
 if(invalid)return error(invalid);
 if(module.trigger!=="ACTIVATE"||module.requirements!==undefined||
    module.impactKind!==undefined||module.steps.length!==2)
  return error("El estado hostil requiere selección y aplicación, sin condiciones.");
 const [select,apply]=module.steps;
 if(select.kind!=="SELECT_TARGET"||select.selector!=="OPPONENT"||
    !only(select,["kind","selector","output"])||
    apply.kind!=="APPLY_STATUS"||!only(apply,["kind","target","stat","operation","value","durationTurns"])||
    apply.target?.source!=="OUTPUT"||apply.target.key!==select.output||
    !STATS.has(String(apply.stat))||typeof apply.stat!=="string"||
    select.when!==undefined||apply.when!==undefined)
  return error("El estado hostil solo puede afectar al rival alcanzado por el ataque.");
 const duration=String(row.duration??"").trim();
 const match=/^(\d+) turnos?$/.exec(duration);
 const durationTurns=match?Number(match[1]):0;
 if(!Number.isSafeInteger(durationTurns)||durationTurns<1||durationTurns>5||
    apply.durationTurns!==durationTurns)
  return error("El estado hostil debe durar entre 1 y 5 turnos, igual que la habilidad.");
 if(typeof apply.value!=="number"||!Number.isFinite(apply.value))
  return error("El valor del estado hostil debe ser una constante finita.");
 if(apply.operation==="BONUS"){
  if(!Number.isSafeInteger(apply.value)||apply.value< -20||apply.value> -1)
   return error("El debilitamiento aditivo debe estar entre -20 y -1.");
 }else if(apply.operation==="MULTIPLIER"){
  if(apply.value<0.8||apply.value>=1)
   return error("El debilitamiento multiplicativo debe ser de ×0,80 hasta menos de ×1.");
 }else return error("El estado hostil necesita un debilitamiento, no una mejora.");
 return {definition:module,stat:apply.stat,operation:apply.operation,
  value:apply.value,durationTurns,usesMagic};
}

/** Execute the approved interpreter only on trusted server-side inputs.
 * The output is frozen in a pending attack, but NOT applied before contact.
 */
export function resolveApprovedHostileStatus(
 plan:ApprovedHostileStatus,by:"PLAYER"|"NPC",
):ResolvedHostileStatus{
 const ownerId=by==="PLAYER"?1:2;
 const targetId=by==="PLAYER"?2:1;
 const result=executeMicroEvent(emptyMicroState(),[plan.definition],{
  eventId:"HostileContactIntent",ownerId,trigger:"ACTIVATE",
  stats:{HP:1,MAX_HP:1},targetIds:{OPPONENT:targetId},
 });
 const intents=result.intents;
 if(intents.length!==1||intents[0].kind!=="APPLY_STATUS")
  throw new Error("El módulo hostil no produjo un único estado autorizado.");
 const applied=intents[0];
 if(applied.targetId!==targetId||applied.stat!==plan.stat||
    applied.operation!==plan.operation||applied.value!==plan.value||
    applied.durationTurns!==plan.durationTurns)
  throw new Error("El estado hostil produjo un resultado distinto del aprobado.");
 return {stat:plan.stat,operation:plan.operation,
  value:plan.value,durationTurns:plan.durationTurns};
}
