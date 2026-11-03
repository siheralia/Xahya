/** Data-defined, passive racial damage multipliers. 100 = unchanged, 50 = half, 175 = +75%. */
export const DAMAGE_TRAIT_TARGETS = ["CUT","BLUNT","PIERCE","FIRE"] as const;
export type DamageTraitTarget = typeof DAMAGE_TRAIT_TARGETS[number];
export type DamageTakenFactors = Partial<Record<DamageTraitTarget,number>>;
type Effect = {type?:unknown;target?:unknown;value?:unknown};
type Skill = {category?:unknown;status?:unknown;grantedByRaceSkillId?:unknown;effect?:unknown};

const validTarget=(value:string):value is DamageTraitTarget =>
  (DAMAGE_TRAIT_TARGETS as readonly string[]).includes(value);

/** Only approved racial PASSIVE skills can grant encounter modifiers. */
export function racialDamageFactors(skills:readonly Skill[]):DamageTakenFactors {
  const result:DamageTakenFactors={};
  for(const skill of skills){
    if(skill.category!=="PASSIVE"||skill.status!=="APPROVED"||
       !Number.isSafeInteger(Number(skill.grantedByRaceSkillId)) ||
       Number(skill.grantedByRaceSkillId)<=0 || !Array.isArray(skill.effect))continue;
    for(const raw of skill.effect as Effect[]){
      if(!raw || raw.type!=="CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER")continue;
      const target=String(raw.target??"").toUpperCase(),percent=Number(raw.value);
      if(!validTarget(target)||!Number.isFinite(percent)||percent<10||percent>300)continue;
      result[target]=Math.min(3,Math.max(0.1,(result[target]??1)*percent/100));
    }
  }
  return result;
}

/** A physical attack checks its stroke type; elemental damage checks the declared skill element. */
export function racialDamageFactor(
  factors:DamageTakenFactors|undefined,
  attackType:"CUT"|"BLUNT"|"PIERCE",
  magical:boolean,
  element?:string,
):number{
  if(!factors)return 1;
  let multiplier=magical?1:(factors[attackType]??1);
  if(element?.toUpperCase()==="FIRE")multiplier*=factors.FIRE??1;
  return Math.min(5,Math.max(0.1,multiplier));
}
