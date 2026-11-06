/**
 * Shared server-side activation contract for an approved, manual item-repair
 * skill. This is deliberately narrower than the general graph interpreter:
 * other effects must not silently run for free or be skipped.
 *
 * Objects and all source statistics come from the authenticated server;
 * browser-provided formula values, durability and ownership are never trusted.
 */
import {executeMicroEvent,emptyMicroState,validateEffectContainers,
  type EffectContainer,type MicroContext,type MicroIntent} from "./micro-modules.ts";
import {isComposedSkillEffect,validateComposedSkillEffect} from "../skills/composed-effects.ts";
import {cooldownTurns} from "../skills/cooldown.ts";

const ALLOWED_STEPS=new Set(["READ_ITEM","READ_STAT","CALCULATE","REPAIR_DURABILITY"]);
export type RepairSkillPlan={
  definitions:EffectContainer[];manaCost:number;skillId:number;
};
export function compileApprovedRepairSkill(skill:Record<string,unknown>):RepairSkillPlan {
  if(skill.status!=="APPROVED")throw new Error("La habilidad aún no está aprobada.");
  const skillId=Number(skill.id);
  if(!Number.isSafeInteger(skillId)||skillId<1)throw new Error("Habilidad inválida.");
  if(!["UTILITY","SUPPORT"].includes(String(skill.category)))
    throw new Error("Solo las habilidades de soporte o utilidad pueden reparar objetos manualmente.");
  const rows=skill.effect;
  if(!Array.isArray(rows)||rows.length<1||rows.length>8||rows.some(row=>!isComposedSkillEffect(row)))
    throw new Error("La habilidad de reparación debe contener únicamente efectos modulares aprobados.");
  const definitions:EffectContainer[]=[];
  for(const row of rows){
    const error=validateComposedSkillEffect(row,"REVIEW");
    if(error)throw new Error(error);
    const module=row.module as EffectContainer;
    if(module.trigger!=="ACTIVATE"||module.steps.some(step=>!ALLOWED_STEPS.has(step.kind)||
      step.kind==="READ_ITEM"&&step.selector==="SOURCE_ITEM"))
      throw new Error("La reparación manual solo admite lectura de objeto/estadística, cálculos y reparación al activar.");
    definitions.push(module);
  }
  if(definitions.every(module=>!module.steps.some(step=>step.kind==="REPAIR_DURABILITY")))
    throw new Error("La habilidad no contiene el micromódulo Restaurar durabilidad.");
  const error=validateEffectContainers(definitions);
  if(error)throw new Error(error);
  const manaCost=Number(skill.cost??0);
  if(!Number.isSafeInteger(manaCost)||manaCost<0||manaCost>1_000_000)
    throw new Error("Coste de maná inválido.");
  // An instant no-mana, no-cooldown repair would enable unlimited free
  // restoration. Staff can authorize either a resource cost or actual reuse delay.
  const cooldown=String(skill.cooldown??"");
  if(manaCost===0&&(cooldown===""||cooldown==="Sin cooldown"||
      cooldown==="Igual a duración"&&cooldownTurns(cooldown,String(skill.duration??""))===0))
    throw new Error("Para reparar, configura un coste de maná o un cooldown real.");
  const mechanics=skill.mechanics;
  if(mechanics&&typeof mechanics==="object"){
    const m=mechanics as {rules?:unknown;activationConditions?:unknown;parentSkillId?:unknown};
    if((Array.isArray(m.rules)&&m.rules.length>0)||
      (Array.isArray(m.activationConditions)&&m.activationConditions.length>0))
      throw new Error("Esta habilidad posee mecánicas adicionales que no puede resolver la reparación.");
  }
  return {definitions,manaCost,skillId};
}

export function repairSkillStats(
 effective:Record<string,number>,derived:Record<string,number>,
 currentHp:number,currentMana:number,
):Record<string,number> {
  const maxHp=Number(derived.maxHp??0);
  if(!Number.isFinite(maxHp)||maxHp<1)throw new Error("HP máximo inválido.");
  const stats:Record<string,number>={
    ...effective,...derived,
    HP:Math.max(0,Math.min(maxHp,currentHp)),
    MAX_HP:maxHp,MANA:currentMana,
  };
  const aliases:Record<string,string>={
    STR:"strength",AGI:"agility",CON:"constitution",INT:"intelligence",
    WIS:"wisdom",CHA:"charisma",SPI:"spirit",LCK:"luck",
    MAGIC_DEF:"magicDefense",MAG_DEF:"magicDefense",
    PHYS_DEF:"physicalDefense",PHYSICAL_DEFENSE:"physicalDefense",
    MAGIC_ATTACK:"magicAttack",PHYSICAL_ATTACK:"physicalAttack",
  };
  for(const [alias,key] of Object.entries(aliases)){
    if(typeof stats[key]==="number"&&Number.isFinite(stats[key]))stats[alias]=stats[key];
  }
  return Object.fromEntries(Object.entries(stats).filter(([_,v])=>
    typeof v==="number"&&Number.isFinite(v)));
}

export function evaluateApprovedRepairSkill(
 plan:RepairSkillPlan,context:Omit<MicroContext,"ownerId"|"eventId"|"trigger">,
):Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>[] {
  const result=executeMicroEvent(emptyMicroState(),plan.definitions,{
    ...context,ownerId:plan.skillId,eventId:"ManualRepair",trigger:"ACTIVATE",
  });
  const intents=result.intents;
  if(intents.some(intent=>intent.kind!=="REPAIR_DURABILITY"))
    throw new Error("La habilidad generó un efecto no autorizado.");
  const repairs=intents as Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>[];
  if(repairs.length===0||repairs.every(repair=>repair.applied===0))
    throw new Error("El objeto ya está reparado o la habilidad no restauró durabilidad.");
  return repairs;
}
