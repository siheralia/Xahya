/**
 * Read-only, fail-closed adapter for numerical projections of existing effects.
 * This does NOT opt any legacy skill into the new combat runtime.
 *
 * Projections preserve source metadata for a later full-fidelity migration;
 * parity here is explicitly about numbers, not targeting, timing, PCH, or effects
 * already rejected by the existing combat engine.
 */
import {executeMicroEvent, emptyMicroState, type EffectContainer, type MicroIntent, type MicroStep} from "../effects/micro-modules.ts";
import {compileCombatSkill} from "../combat/skill-casting.ts";
import {racialDamageFactors, racialDamageFactor, type DamageTakenFactors} from "../combat/innate-traits.ts";

type RawEffect = Record<string, unknown>;
export type LegacySkip = { index:number; type:string; reason:string };
export type LegacyProjected = {
  containers:EffectContainer[];
  skipped:LegacySkip[];
  /** Untranslated properties remain present in the original saved effect rows. */
  source:Array<{index:number; effect:RawEffect; unmappedParameters:string[]}>;
  /** Numeric parity is NOT equivalent to runtime-equivalence. */
  executionReady:false;
};

const MAX = 1_000_000;
const KEY=/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const STAT_ALIASES:Readonly<Record<string,string>>={
  PHYS_ATK:"physicalAttack",PHYSICAL_ATTACK:"physicalAttack",
  MAGIC_ATK:"magicAttack",MAGIC_ATTACK:"magicAttack",
  DEF:"physicalDefense",PHYSICAL_DEFENSE:"physicalDefense",
  MAG_DEF:"magicDefense",MAGIC_DEFENSE:"magicDefense",
  PRECISION:"precision",DODGE:"dodge",
};
const mappedFields=new Set(["type","value","target","description"]);
const statName=(target:string)=>STAT_ALIASES[target]??target;
const divisor=(n:number)=>({operator:"DIVIDE" as const,args:[n,100]});
const stepFor=(type:string,target:string,value:number):MicroStep|undefined=>{
  switch(type){
    case "DAMAGE_MULTIPLIER":
      if(!["PHYS_ATK","PHYSICAL_ATTACK","MAGIC_ATK","MAGIC_ATTACK"].includes(target))return undefined;
      return {kind:"MODIFIER",stat:"DAMAGE_MULTIPLIER",multiplier:divisor(value)};
    case "FINAL_DAMAGE_MULTIPLIER": return {kind:"MODIFIER",stat:"FINAL_DAMAGE_MULTIPLIER",multiplier:divisor(value)};
    case "IGNORE_PHYS_DEF_MULTIPLIER": return {kind:"MODIFIER",stat:"DEFENSE_FACTOR",multiplier:divisor(value)};
    case "IGNORE_MAGIC_DEF_MULTIPLIER": return {kind:"MODIFIER",stat:"DEFENSE_FACTOR",multiplier:divisor(value)};
    case "STAT_BONUS":
      return KEY.test(statName(target)) ? {kind:"BONUS",stat:statName(target),amount:value} : undefined;
    case "STAT_MULTIPLIER":
      return KEY.test(statName(target)) ? {kind:"MODIFIER",stat:"STAT_MULTIPLIER:"+statName(target),multiplier:divisor(value)} : undefined;
    case "RESOURCE_BONUS":
      return target==="HP"?{kind:"HEAL",amount:value}:undefined;
    case "CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER":
      return ["CUT","BLUNT","PIERCE","FIRE"].includes(target)
        ? {kind:"MODIFIER",stat:"DAMAGE_TAKEN:"+target,multiplier:divisor(value)}:undefined;
    default:return undefined;
  }
};
export function projectLegacyNumericEffects(raw:unknown):LegacyProjected {
  if(!Array.isArray(raw)||raw.length>32)throw new Error("Lista de efectos inválida o demasiado larga.");
  const result:LegacyProjected={containers:[],skipped:[],source:[],executionReady:false};
  for(const [index,item] of raw.entries()){
    const row=item&&typeof item==="object"&&!Array.isArray(item)?item as RawEffect:{};
    const type=typeof row.type==="string"?row.type:"(sin tipo)";
    const target=typeof row.target==="string"?row.target:"";
    const value=typeof row.value==="number"?row.value:NaN;
    const unmappedParameters=Object.keys(row).filter(key=>!mappedFields.has(key));
    result.source.push({index,effect:{...row},unmappedParameters});
    if(!Number.isFinite(value)||value<0||value>MAX){
      result.skipped.push({index,type,reason:"Valor numérico inválido; no se puede probar equivalencia."});
      continue;
    }
    // Racial damage factors only accept 10..300; mirror current racial resolver.
    if(type==="CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER"&&(value<10||value>300)){
      result.skipped.push({index,type,reason:"Factor racial fuera del intervalo operativo."});continue;
    }
    const step=stepFor(type,target,value);
    if(!step){result.skipped.push({index,type,reason:"No hay proyección numérica de este efecto/objetivo."});continue;}
    result.containers.push({
      id:"LEGACY_"+index, name:"Efecto "+type, type:"LEGACY_PROJECTION",
      description:typeof row.description==="string"?row.description.slice(0,2000):"",
      trigger:"PASSIVE", steps:[step],
    });
  }
  return result;
}
export function evaluateLegacyNumericProjection(projected:LegacyProjected):MicroIntent[] {
  if(projected.skipped.length)throw new Error("No se puede evaluar una proyección parcial como equivalente.");
  // Synthetic, generous HP ceiling: compare raw healing strength, not encounter HP cap.
  return executeMicroEvent(emptyMicroState(),projected.containers,{
    ownerId:1,eventId:"NumericParity",trigger:"PASSIVE",stats:{HP:0,MAX_HP:MAX}
  }).intents;
}

export type CombatNumericComparison = {
  equivalent:boolean;
  differences:string[];
  projected:LegacyProjected;
  expected:{damageMultiplier:number;defenseFactor:number;finalMultiplier:number;healing:number;bonuses:Array<{stat:string;value:number}>};
  actual:{damageMultiplier:number;defenseFactor:number;finalMultiplier:number;healing:number;bonuses:Array<{stat:string;value:number}>};
};
const close=(a:number,b:number)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
/** Exact parity of the numeric subset accepted by compileCombatSkill. */
export function compareLegacyCombatNumbers(row:Record<string,unknown>):CombatNumericComparison {
  const plan=compileCombatSkill(row); // The authoritative legacy validation.
  const projected=projectLegacyNumericEffects(row.effect);
  const intents=evaluateLegacyNumericProjection(projected);
  const actual:CombatNumericComparison["actual"]={
    damageMultiplier:1,defenseFactor:1,finalMultiplier:1,healing:0,bonuses:[]
  };
  for(const intent of intents){
    if(intent.kind==="HEAL")actual.healing+=intent.requested;
    if(intent.kind==="BONUS")actual.bonuses.push({stat:intent.stat,value:intent.amount});
    if(intent.kind==="MODIFIER"){
      switch(intent.stat){
        case "DAMAGE_MULTIPLIER":actual.damageMultiplier*=intent.multiplier;break;
        case "DEFENSE_FACTOR":actual.defenseFactor*=intent.multiplier;break;
        case "FINAL_DAMAGE_MULTIPLIER":actual.finalMultiplier*=intent.multiplier;break;
        default:throw new Error("Modificador no comparable con compilador de combate: "+intent.stat);
      }
    }
  }
  const expected={
    damageMultiplier:plan.damageMultiplier,defenseFactor:plan.defenseFactor,finalMultiplier:plan.finalMultiplier,
    healing:plan.healing,bonuses:plan.bonuses.map(({stat,value})=>({stat,value})),
  };
  const differences:string[]=[];
  for(const key of ["damageMultiplier","defenseFactor","finalMultiplier","healing"] as const){
    if(!close(actual[key],expected[key]))differences.push(key);
  }
  if(JSON.stringify(actual.bonuses)!==JSON.stringify(expected.bonuses))differences.push("bonuses");
  return {equivalent:differences.length===0,differences,projected,expected,actual};
}

/**
 * Numerically compare actual racial damage-type factors with the existing
 * capped racial passive interpreter. No switch to the micro runtime.
 */
export function compareLegacyRacialDamageNumbers(effects:readonly unknown[]):{
  equivalent:boolean; expected:DamageTakenFactors; actual:DamageTakenFactors;
  differences:string[]; projected:LegacyProjected;
}{
  const projected=projectLegacyNumericEffects(effects);
  if(projected.skipped.length || projected.containers.some(c=>c.steps.some(s=>s.kind!=="MODIFIER"||!s.stat.startsWith("DAMAGE_TAKEN:"))))
    throw new Error("La comparación racial solo admite factores de daño condicionado.");
  const intents=evaluateLegacyNumericProjection(projected);
  const actual:DamageTakenFactors={};
  const validTargets=["CUT","BLUNT","PIERCE","FIRE"] as const;
  for(const intent of intents){
    if(intent.kind!=="MODIFIER")throw new Error("Proyección racial inválida.");
    const target=intent.stat.slice("DAMAGE_TAKEN:".length);
    if(!validTargets.some(t=>t===target))throw new Error("Objetivo racial desconocido.");
    const typedTarget=target as typeof validTargets[number];
    actual[typedTarget]=Math.min(3,Math.max(.1,(actual[typedTarget]??1)*intent.multiplier));
  }
  const expected=racialDamageFactors([{category:"PASSIVE",status:"APPROVED",grantedByRaceSkillId:1,effect:effects}]);
  const differences:string[]=[];
  for(const target of validTargets){
    if(!close(actual[target]??1,expected[target]??1))differences.push(target);
  }
  for(const attack of ["CUT","BLUNT","PIERCE"] as const){
    for(const magical of [true,false]){
      for(const element of [undefined,"FIRE"]){
        const exp=racialDamageFactor(expected,attack,magical,element);
        const got=racialDamageFactor(actual,attack,magical,element);
        if(!close(exp,got))differences.push("damage-"+attack+"-"+magical+"-"+element);
      }
    }
  }
  return {equivalent:differences.length===0,expected,actual,differences,projected};
}
