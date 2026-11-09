/**
 * Phase D2.1: only already APPROVED, staff-priced COMPOSED passives may
 * install encounter event handlers. The player's request never supplies a
 * graph. No arbitrary ACTIVATE, DAMAGE, REPAIR or summoning steps run here.
 *
 * Initially supports a single self-contained "mitigated damage -> charges ->
 * guarded resistance/turn regeneration" family per combatant. Every source
 * module must belong to the same approved skill and pay reviewed PCH.
 */
import {validateEffectContainers,type EffectContainer,type MicroStep} from "../effects/micro-modules.ts";
import {isComposedSkillEffect,validateComposedSkillList,
  type ComposedSkillEffect} from "../skills/composed-effects.ts";
import {meetsEffectRequirements,validEffectRequirements,
  type EffectRequirement,type SkillWithEffects} from "../skills/effect-requirements.ts";

type SkillRow=Record<string,unknown>;
type SkillActivation={skillId?:unknown;active?:unknown};
export type ApprovedMicroSnapshot={
 definitions:EffectContainer[];
 skillIds:number[];
 /** Counts are intentionally server-only, never shown as hidden-power hints. */
 skipped:number;
};
const positiveId=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>0;
const record=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==="object"&&!Array.isArray(x);
const hasOwn=(x:Record<string,unknown>,key:string)=>
 Object.prototype.hasOwnProperty.call(x,key);

function chargeCondition(step:MicroStep,key:string,compare:"EQ"|"GTE",right:0|1):boolean{
 const conditions=step.when;
 return Array.isArray(conditions)&&conditions.length===1&&
  conditions[0].compare===compare&&
  record(conditions[0].left)&&conditions[0].left.source==="CHARGES"&&
  conditions[0].left.key===key&&conditions[0].right===right;
}
function allowedPair(modules:readonly EffectContainer[]):{
 accumulator:string;definitions:EffectContainer[];
}|null{
 // Prevent unpriced combinations of a passive and a separate normal action.
 if(modules.length<2||modules.length>3)return null;
 if(modules.some(m=>m.requirements!==undefined||m.impactKind!==undefined||
   m.steps.length!==1))return null;
 const store=modules.find(m=>m.trigger==="DAMAGE_RESOLVED");
 if(!store||store.steps[0].kind!=="STORE")return null;
 const s=store.steps[0];
 if(s.capacity<1||s.capacity>5||!record(s.value)||
   s.value.source!=="EVENT"||s.value.key!=="MITIGATED_DAMAGE"||
   s.when!==undefined)return null;
 const triggers=new Set(modules.map(m=>m.trigger));
 if(triggers.size!==modules.length ||
   modules.some(m=>!["DAMAGE_RESOLVED","PASSIVE","TURN_START"].includes(m.trigger)))
  return null;
 for(const module of modules){
  const step=module.steps[0];
  if(module.trigger==="DAMAGE_RESOLVED"){
   if(module!==store)return null;
  }else if(module.trigger==="PASSIVE"){
   if(step.kind!=="MODIFIER"||step.stat!=="RESISTANCE"||
     step.sourceTarget!==undefined||step.sourceElement!==undefined||
     typeof step.multiplier!=="number"||!Number.isFinite(step.multiplier)||
     step.multiplier<1||step.multiplier>1.3||
     !chargeCondition(step,s.accumulator,"EQ",0))return null;
  }else if(module.trigger==="TURN_START"){
   if(step.kind!=="HEAL"||!record(step.amount)||
      step.amount.operator!=="PERCENT"||!Array.isArray(step.amount.args)||
      step.amount.args.length!==2||
      !record(step.amount.args[0])||
      step.amount.args[0].source!=="STAT"||
      step.amount.args[0].key!=="MAX_HP"||
      typeof step.amount.args[1]!=="number"||
      !Number.isInteger(step.amount.args[1])||
      step.amount.args[1]<1||step.amount.args[1]>10||
      !chargeCondition(step,s.accumulator,"GTE",1))return null;
  }
 }
 return {accumulator:s.accumulator,definitions:[...modules]};
}
/** Validate an entire skill, not an individual fragment. Fail closed. */
export function compileApprovedPassiveMicro(row:SkillRow):EffectContainer[]|null{
 const id=row.id;
 if(!positiveId(id)||row.status!=="APPROVED"||row.category!=="PASSIVE"||
   row.approvedAt===null||row.approvedAt===undefined||
   !Number.isSafeInteger(row.pchCost)||Number(row.pchCost)<1||
   Number(row.cost??0)!==0||Number(row.maintenanceCost??0)!==0||
   Number(row.accumulationCost??0)!==0||Number(row.accumulationPerTick??0)!==0||
   (typeof row.condition==="string"&&row.condition.trim()!==""))return null;
 const mechanics=record(row.mechanics)?row.mechanics:{};
 if(Object.keys(mechanics).some(key=>key!=="parentSkillId"))return null;
 const entries=row.effect;
 if(!Array.isArray(entries)||entries.length<2||entries.length>3||
   !entries.every(isComposedSkillEffect)||
   validateComposedSkillList(entries,"REVIEW"))return null;
 const modules=(entries as ComposedSkillEffect[]).map(e=>e.module);
 if(validateEffectContainers(modules))return null;
 const parsed=allowedPair(modules);
 if(!parsed)return null;
 // Namespace the mutable accumulator by approved skill identity; never
 // allow two different paid skills to transfer charges accidentally.
 const key="S"+id+"_CHARGE";
 return parsed.definitions.map((definition,index)=>{
  const step=structuredClone(definition.steps[0]) as MicroStep;
  if(step.kind==="STORE")step.accumulator=key;
  if(step.when)step.when=step.when.map(c=>({
   ...c,left:{source:"CHARGES" as const,key}
  }));
  return {
   id:"SKILL"+id+"_M"+index,
   name:definition.name,
   type:"APPROVED_PASSIVE",
   description:definition.description,
   trigger:definition.trigger,
   steps:[step],
  };
 });
}
/** All filters are server-side. A stolen, pending, unpaid or disabled row
 * never becomes an executable passive, even if it contains valid module JSON.
 */
export function approvedPassiveMicroSnapshot(
 rows:readonly SkillRow[],states:readonly SkillActivation[],
 stolenIds:ReadonlySet<number>,
):ApprovedMicroSnapshot {
 const valid=rows.filter(row=>row.status==="APPROVED"&&positiveId(row.id)&&
  !stolenIds.has(Number(row.id)));
 const ids=new Set(valid.map(r=>Number(r.id)));
 const activation=new Map(states.filter(s=>positiveId(s.skillId))
   .map(s=>[Number(s.skillId),s.active===true]));
 const collected:EffectContainer[]=[];
 const skillIds:number[]=[];
 let skipped=0,hasDefense=false,hasRegen=false;
 const approvedForRequirement=valid as unknown as SkillWithEffects[];
 for(const row of [...valid].sort((a,b)=>Number(a.id)-Number(b.id))){
  if(row.category!=="PASSIVE"||!Array.isArray(row.effect)||
    !row.effect.some(isComposedSkillEffect))continue;
  const id=Number(row.id),mechanics=record(row.mechanics)?row.mechanics:{};
  const parent=mechanics.parentSkillId;
  if((activation.has(id)&&!activation.get(id))||
    (parent!=null&&(!positiveId(parent)||!ids.has(parent)))){skipped++;continue;}
  const req=row.effectRequirements??[];
  if(!validEffectRequirements(req)||!meetsEffectRequirements(
    req as EffectRequirement[],approvedForRequirement.filter(s=>
     Number((s as unknown as SkillRow).id)!==id))){skipped++;continue;}
  const compiled=compileApprovedPassiveMicro(row);
  if(!compiled){skipped++;continue;}
  const defense=compiled.some(d=>d.trigger==="PASSIVE");
  const regen=compiled.some(d=>d.trigger==="TURN_START");
  // First cutover intentionally caps passive defense and healing stacking:
  // one multiplicative resistance and one paid regeneration source per side.
  if(collected.length+compiled.length>8||(hasDefense&&defense)||(hasRegen&&regen)){
   skipped++;continue;
  }
  collected.push(...compiled);
  hasDefense||=defense;hasRegen||=regen;
  skillIds.push(id);
 }
 return {definitions:collected,skillIds,skipped};
}
