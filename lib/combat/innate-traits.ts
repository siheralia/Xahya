import {cloneLegacySkillAsMicro,evaluateLegacyShadowParts} from "../effects/legacy-modular-shadow.ts";
/** Data-defined damage multipliers. Percent 100 = unchanged, 10 = one tenth, 300 = triple. */
export const DAMAGE_TRAIT_TARGETS = ["CUT","BLUNT","PIERCE","FIRE"] as const;
export const DAMAGE_PERK_TARGETS = ["ALL","PHYSICAL","MAGICAL"] as const;
export type DamageTraitTarget = typeof DAMAGE_TRAIT_TARGETS[number];
export type DamagePerkTarget = typeof DAMAGE_PERK_TARGETS[number];
export type DamageTakenFactors = Partial<Record<DamageTraitTarget|DamagePerkTarget,number>>;
type Effect = {type?:unknown;target?:unknown;value?:unknown};
type Skill = {category?:unknown;status?:unknown;grantedByRaceSkillId?:unknown;effect?:unknown};
type DamagePerkEffect = {type:"DAMAGE_REDUCTION"|"DAMAGE_INCREASE";target:DamagePerkTarget;value:number};

const validTarget=(value:string):value is DamageTraitTarget =>
  (DAMAGE_TRAIT_TARGETS as readonly string[]).includes(value);
const validPerkTarget=(value:string):value is DamagePerkTarget =>
  (DAMAGE_PERK_TARGETS as readonly string[]).includes(value);
const bounded=(factor:number)=>Math.min(5,Math.max(0.1,factor));

/** Only approved racial PASSIVE skills can grant encounter modifiers. */
export function racialDamageFactors(skills:readonly Skill[]):DamageTakenFactors {
  const result:DamageTakenFactors={};
  for(const skill of skills){
    if(skill.category!=="PASSIVE"||skill.status!=="APPROVED"||
       !Number.isSafeInteger(Number(skill.grantedByRaceSkillId)) ||
       Number(skill.grantedByRaceSkillId)<=0 || !Array.isArray(skill.effect))continue;
    // Prefer the micro clone only for a fully covered racial damage passive.
    // Reject unknown intent types and fall back to the unchanged legacy path.
    const clone=cloneLegacySkillAsMicro({
      id:Number(skill.grantedByRaceSkillId),name:"Racial",effect:skill.effect
    },"raceSkill");
    if(clone.coverage==="COMPLETE" && clone.parts.every(p=>p.sourceType==="CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER")){
      const intents=evaluateLegacyShadowParts(clone.parts);
      if(intents.length===clone.parts.length && intents.every(i=>i.kind==="MODIFIER" &&
          i.stat.startsWith("DAMAGE_TAKEN:"))){
        for(const intent of intents){
          if(intent.kind!=="MODIFIER")continue;
          const target=intent.stat.slice("DAMAGE_TAKEN:".length);
          if(!validTarget(target) || intent.multiplier<0.1 || intent.multiplier>3)continue;
          result[target]=Math.min(3,Math.max(0.1,(result[target]??1)*intent.multiplier));
        }
        continue;
      }
    }
    for(const raw of skill.effect as Effect[]){
      if(!raw || raw.type!=="CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER")continue;
      const target=String(raw.target??"").toUpperCase(),percent=Number(raw.value);
      if(!validTarget(target)||!Number.isFinite(percent)||percent<10||percent>300)continue;
      result[target]=Math.min(3,Math.max(0.1,(result[target]??1)*percent/100));
    }
  }
  return result;
}

/** Read a catalog perk's damage-taken modifier; never treat arbitrary effects as damage. */
export function parseDamagePerkEffect(raw:unknown):DamagePerkEffect|null {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const effect=raw as Effect;
  const type=effect.type;
  if(type!=="DAMAGE_REDUCTION"&&type!=="DAMAGE_INCREASE")return null;
  const target=String(effect.target??"").toUpperCase();
  if(!validPerkTarget(target))return null;
  const value=effect.value;
  if(typeof value!=="number"||!Number.isFinite(value))return null;
  // A reduction is the fraction remaining, an increase is a larger multiplier.
  // Bound effects to the engine's established 10%-500% safety envelope.
  if(type==="DAMAGE_REDUCTION"&&(value<10||value>100))return null;
  if(type==="DAMAGE_INCREASE"&&(value<100||value>500))return null;
  return {type,target,value};
}

/** All combat-compatible perk effects apply independently of narrative/maze-only effects. */
export function perkDamageFactors(effects:readonly unknown[]):DamageTakenFactors {
  const result:DamageTakenFactors={};
  for(const raw of effects){
    const effect=parseDamagePerkEffect(raw);
    if(!effect)continue;
    result[effect.target]=bounded((result[effect.target]??1)*effect.value/100);
  }
  return result;
}

/** Preserve and stack damage factors from racial skills and catalog perks. */
export function mergeDamageTakenFactors(...groups:readonly DamageTakenFactors[]):DamageTakenFactors {
  const result:DamageTakenFactors={};
  for(const group of groups){
    for(const key of [...DAMAGE_TRAIT_TARGETS,...DAMAGE_PERK_TARGETS]){
      const factor=group[key];
      if(typeof factor!=="number"||!Number.isFinite(factor)||factor<=0)continue;
      result[key]=bounded((result[key]??1)*factor);
    }
  }
  return result;
}

/** Physical damage checks stroke and PHYSICAL; magic checks MAGICAL; FIRE stacks by element. */
export function racialDamageFactor(
  factors:DamageTakenFactors|undefined,
  attackType:"CUT"|"BLUNT"|"PIERCE",
  magical:boolean,
  element?:string,
):number{
  if(!factors)return 1;
  let multiplier=(factors.ALL??1)*(magical?(factors.MAGICAL??1):(factors.PHYSICAL??1)*(factors[attackType]??1));
  if(element?.toUpperCase()==="FIRE")multiplier*=factors.FIRE??1;
  return bounded(multiplier);
}
