/**
 * Read-only copies of historical effects expressed as executable micro-steps.
 * Original skills remain the authority for ownership, PCH, activation,
 * targets, duration and any capability not yet supported by the interpreter.
 */
import {
  emptyMicroState,executeMicroEvent,validateEffectContainers,
  type EffectContainer,type MicroIntent,type MicroStep,
} from "./micro-modules.ts";

export type LegacyShadowPart={
  sourceIndex:number; sourceType:string; status:"EXECUTABLE"|"DESCRIPTION_ONLY"|"UNSUPPORTED";
  reason?:string; modules:EffectContainer[];
};
export type LegacyModularShadow={
  origin:{source:"skill"|"raceSkill"|"genericSkillTemplate";id:number;name:string};
  label:string;
  /** Virtual duplicate, never an approved skill or an automatic PCH purchase. */
  enabled:false;uncharged:true;parts:LegacyShadowPart[];
  coverage:"COMPLETE"|"PARTIAL"|"UNSUPPORTED";
};
const pct=(value:number)=>value/100;
const validKey=(s:string)=>/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(s);
const valueOf=(e:Record<string,unknown>)=>typeof e.value==="number"?e.value:NaN;
const good=(n:number)=>Number.isFinite(n)&&n>0&&n<=1_000_000;
const modifier=(stat:string,value:number):MicroStep=>({kind:"MODIFIER",stat,multiplier:pct(value)});
const bonus=(stat:string,value:number):MicroStep=>({kind:"BONUS",stat,amount:value});
/** No catch-all legacy wrapper: unknown actions are explicitly unsupported. */
export function modularStepsForLegacyEffect(raw:unknown):{
  status:LegacyShadowPart["status"];steps:MicroStep[];reason?:string;
}{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    return {status:"UNSUPPORTED",steps:[],reason:"Fila inválida"};
  const e=raw as Record<string,unknown>;
  const type=String(e.type??""),target=String(e.target??"");
  const value=valueOf(e);
  if(type==="NARRATIVE"){
    if(e.capability==="CREATE" && typeof e.element==="string" && validKey(e.element.toUpperCase()))
      return {status:"EXECUTABLE",steps:[bonus("CONSTRUCTION:"+e.element.toUpperCase(),1)]};
    return {status:"DESCRIPTION_ONLY",steps:[],reason:"Narrativa sin resolutor modular; se conserva en el original"};
  }
  if(!good(value))return {status:"UNSUPPORTED",steps:[],reason:"Valor no numérico o fuera de límites"};
  switch(type){
    case "DAMAGE_MULTIPLIER":
      return ["PHYS_ATK","PHYSICAL_ATTACK","MAGIC_ATK","MAGIC_ATTACK"].includes(target)
        ?{status:"EXECUTABLE",steps:[modifier("DAMAGE_MULTIPLIER",value)]}
        :{status:"UNSUPPORTED",steps:[],reason:"Objetivo de ataque no resuelto"};
    case "FINAL_DAMAGE_MULTIPLIER":return {status:"EXECUTABLE",steps:[modifier("FINAL_DAMAGE_MULTIPLIER",value)]};
    case "IGNORE_PHYS_DEF_MULTIPLIER":
    case "IGNORE_MAGIC_DEF_MULTIPLIER":return {status:"EXECUTABLE",steps:[modifier("DEFENSE_FACTOR",value)]};
    case "RESOURCE_BONUS":
      return target==="HP"?{status:"EXECUTABLE",steps:[{kind:"HEAL",amount:value}]}:
        {status:"UNSUPPORTED",steps:[],reason:"Recurso distinto de HP sin integración"};
    case "STAT_BONUS":
      return validKey(target)?{status:"EXECUTABLE",steps:[bonus("STAT_BONUS:"+target,value)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Estadística no válida"};
    case "STAT_MULTIPLIER":
      return validKey(target)?{status:"EXECUTABLE",steps:[modifier("STAT_MULTIPLIER:"+target,value)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Estadística no válida"};
    case "CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER":
      return ["CUT","BLUNT","PIERCE","FIRE"].includes(target)&&value>=10&&value<=300
        ?{status:"EXECUTABLE",steps:[modifier("DAMAGE_TAKEN:"+target,value)]}
        :{status:"UNSUPPORTED",steps:[],reason:"Condición de defensa racial no válida"};
    case "MAZE_TRAP_EVASION":
      return target==="TRAP"&&value<=100?{status:"EXECUTABLE",steps:[bonus("MAZE_TRAP_EVASION",value)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Evasión de trampas fuera de límites"};
    case "MAZE_TREASURE_ITEM_CHANCE":
      return target==="TREASURE"&&value<=100?{status:"EXECUTABLE",steps:[bonus("MAZE_ITEM_CHANCE",value)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Probabilidad de tesoros inválida"};
    case "MAZE_TREASURE_MONEY_BONUS":
      return target==="TREASURE"&&value<=100?{status:"EXECUTABLE",steps:[bonus("MAZE_MONEY_BONUS",value)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Bono monetario inválido"};
    case "MAZE_UTILITY":
      return target==="INVISIBILITY"?{status:"EXECUTABLE",steps:[bonus("MAZE_INVISIBILITY",1)]}:
        {status:"UNSUPPORTED",steps:[],reason:"Utilidad de laberinto desconocida"};
    case "SUMMON_MIRROR":return value<=1000?{status:"EXECUTABLE",steps:[bonus("MIRROR_DURABILITY",value)]}:
      {status:"UNSUPPORTED",steps:[],reason:"Resistencia de espejo fuera de límites"};
    case "MIRROR_RAY":return value<=1000?{status:"EXECUTABLE",steps:[modifier("MIRROR_RAY_FACTOR",value)]}:
      {status:"UNSUPPORTED",steps:[],reason:"Rayo fuera de límites"};
    case "MAGIC_REFLECTION":return value<=1000?{status:"EXECUTABLE",steps:[modifier("MIRROR_REFLECTION_FACTOR",value)]}:
      {status:"UNSUPPORTED",steps:[],reason:"Reflexión fuera de límites"};
    case "DAMAGE_REDUCTION":
    case "DAMAGE_INCREASE":
      return ["ALL","PHYSICAL","MAGICAL"].includes(target) && value>=10 && value<=500
        ?{status:"EXECUTABLE",steps:[modifier("DAMAGE_TAKEN:"+target,value)]}
        :{status:"UNSUPPORTED",steps:[],reason:"Reducción/aumento fuera de límites"};
    case "COPY_SKILL":
    case "STEAL_SKILL":
      return {status:"UNSUPPORTED",steps:[],reason:"La copia o robo requiere permisos, selección, almacenamiento y un resolutor especializado"};
    default:
      return {status:"UNSUPPORTED",steps:[],reason:"Tipo no implementado como micromódulo"};
  }
}
export function cloneLegacySkillAsMicro(
  row:Record<string,unknown>,
  source:LegacyModularShadow["origin"]["source"]="skill",
):LegacyModularShadow{
  const id=Number(row.id),name=String(row.name??"Habilidad");
  if(!Number.isSafeInteger(id)||id<1||!Array.isArray(row.effect)||row.effect.length>20)
    throw new Error("Habilidad original inválida");
  const parts:LegacyShadowPart[]=row.effect.map((e,index)=>{
    const projection=modularStepsForLegacyEffect(e);
    const effectType=e&&typeof e==="object"&&!Array.isArray(e)?String((e as Record<string,unknown>).type??""):"";
    const modules:EffectContainer[]=projection.steps.length?[{
      id:"LEGACY_"+id+"_"+index,name:name+" / "+effectType,type:"LEGACY_MICRO",
      description:"Versión modular de prueba",trigger:"PASSIVE",steps:projection.steps,
    }]:[];
    const error=validateEffectContainers(modules);
    if(error)throw new Error(error);
    return {sourceIndex:index,sourceType:effectType,status:projection.status,
      ...(projection.reason?{reason:projection.reason}:{}),modules};
  });
  const coverage=parts.every(p=>p.status==="EXECUTABLE")?"COMPLETE":
    parts.some(p=>p.status==="EXECUTABLE")?"PARTIAL":"UNSUPPORTED";
  return {origin:{source,id,name},label:name+" · copia modular",enabled:false,uncharged:true,parts,coverage};
}
export function evaluateLegacyShadowParts(parts:readonly LegacyShadowPart[]):MicroIntent[] {
  if(parts.some(p=>p.status!=="EXECUTABLE"))throw new Error("La copia requiere un resolutor antes de ejecutarse.");
  const modules=parts.flatMap(p=>p.modules);
  if(!modules.length)throw new Error("La copia no tiene mecánicas ejecutables.");
  const result=executeMicroEvent(emptyMicroState(),modules,{
    ownerId:1,eventId:"LegacyShadow",trigger:"PASSIVE",stats:{HP:0,MAX_HP:1_000_000_000},
  });
  return result.intents;
}
/**
 * Numeric intent bridge for the existing combat plan. Legacy compile still
 * enforces targeting, approval, resources, cooldown and the special resolver.
 */
export function legacyShadowCombatNumbers(raw:unknown):{
  damageMultiplier:number;defenseFactor:number;finalMultiplier:number;healing:number;
  bonuses:Array<{stat:string;value:number}>;
  mirror?:{durability:number;rayMultiplier:number;reflectionMultiplier:number};
  constructionMaterial?:string;
}|null{
  if(!Array.isArray(raw)||raw.length<1||raw.length>20)return null;
  const shadow=cloneLegacySkillAsMicro({id:1,name:"Sombra",effect:raw});
  if(shadow.coverage!=="COMPLETE")return null;
  const intents=evaluateLegacyShadowParts(shadow.parts);
  const result:{damageMultiplier:number;defenseFactor:number;finalMultiplier:number;healing:number;
    bonuses:Array<{stat:string;value:number}>;
    mirror?:{durability:number;rayMultiplier:number;reflectionMultiplier:number};
    constructionMaterial?:string}={
    damageMultiplier:1,defenseFactor:1,finalMultiplier:1,healing:0,bonuses:[],
  };
  let mirrorDurability:number|undefined,mirrorRay:number|undefined,mirrorReflect:number|undefined;
  const stats:Record<string,string>={
    PHYS_ATK:"physicalAttack",PHYSICAL_ATTACK:"physicalAttack",
    MAGIC_ATK:"magicAttack",MAGIC_ATTACK:"magicAttack",
    DEF:"physicalDefense",PHYSICAL_DEFENSE:"physicalDefense",
    MAG_DEF:"magicDefense",MAGIC_DEFENSE:"magicDefense",
    PRECISION:"precision",DODGE:"dodge",
  };
  for(const intent of intents){
    if(intent.kind==="HEAL")result.healing+=intent.requested;
    if(intent.kind==="BONUS"){
      if(intent.stat==="MIRROR_DURABILITY")mirrorDurability=intent.amount;
      else if(intent.stat.startsWith("CONSTRUCTION:"))result.constructionMaterial=intent.stat.slice("CONSTRUCTION:".length);
      else if(intent.stat.startsWith("STAT_BONUS:")){
        const stat=stats[intent.stat.slice("STAT_BONUS:".length)];
        if(!stat)return null;
        result.bonuses.push({stat,value:intent.amount});
      }else return null;
    }
    if(intent.kind==="MODIFIER"){
      switch(intent.stat){
        case "DAMAGE_MULTIPLIER":result.damageMultiplier*=intent.multiplier;break;
        case "DEFENSE_FACTOR":result.defenseFactor*=intent.multiplier;break;
        case "FINAL_DAMAGE_MULTIPLIER":result.finalMultiplier*=intent.multiplier;break;
        case "MIRROR_RAY_FACTOR":mirrorRay=intent.multiplier;break;
        case "MIRROR_REFLECTION_FACTOR":mirrorReflect=intent.multiplier;break;
        default:return null;
      }
    }
  }
  if(mirrorDurability!==undefined||mirrorRay!==undefined||mirrorReflect!==undefined){
    if(mirrorDurability===undefined||mirrorRay===undefined||mirrorReflect===undefined)return null;
    result.mirror={durability:mirrorDurability,rayMultiplier:mirrorRay,reflectionMultiplier:mirrorReflect};
  }
  return result;
}
