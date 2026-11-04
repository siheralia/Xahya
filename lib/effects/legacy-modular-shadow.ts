/**
 * Read-only copies of historical effects expressed as executable micro-steps.
 * Original skills remain the authority for ownership, PCH, activation,
 * targets, duration and any capability not yet supported by the interpreter.
 */
import {
  emptyMicroState,executeMicroEvent,validateEffectContainers,
  type EffectContainer,type MicroIntent,type MicroStep,
} from "./micro-modules.ts";
import {validateVariableResistance,type VariableResistance} from "../skills/variable-resistance.ts";

export type LegacyShadowPart={
  sourceIndex:number; sourceType:string; status:"EXECUTABLE"|"DESCRIPTION_ONLY"|"UNSUPPORTED";
  reason?:string; modules:EffectContainer[];
};
export type LegacyModularShadow={
  origin:{source:"skill"|"raceSkill"|"genericSkillTemplate";id:number;name:string};
  label:string;
  /** Virtual duplicate, never an approved skill or an automatic PCH purchase. */
  enabled:false;uncharged:true;parts:LegacyShadowPart[];
  /** Every source effect gets a typed representation even when it requires human adjudication. */
  represented:boolean;
  /** Historical requirements belong to the skill, not to the narrated effect. */
  rules:{category?:string;condition?:string;duration?:string;cooldown?:string;
    maintenanceCost?:number;mechanics?:Record<string,unknown>};
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
    // A capability is a first-class micro-step, NOT a numeric combat effect.
    // Retain the old card identifier, element, target and description verbatim.
    const code=target.startsWith("CARD:W")?target:"NARRATIVE:OTHER";
    if(!/^(CARD:W[0-9]{3}|NARRATIVE:OTHER)$/.test(code))
      return {status:"UNSUPPORTED",steps:[],reason:"Código narrativo desconocido"};
    const capability:MicroStep={kind:"CAPABILITY",code,
      description:typeof e.description==="string"?e.description.slice(0,1500):"",
      target:target||undefined,element:typeof e.element==="string"?e.element.toUpperCase():undefined,
      targetKind:typeof e.targetKind==="string"?e.targetKind:undefined,
      targetReference:typeof e.targetReference==="string"?e.targetReference:undefined,
      durationMovements:typeof e.durationMovements==="number"?e.durationMovements:undefined,
      activationCondition:typeof e.activationCondition==="string"?e.activationCondition:undefined,
      value:typeof e.value==="number"?e.value:undefined};
    if(e.capability==="CREATE" && typeof e.element==="string" && validKey(e.element.toUpperCase()))
      return {status:"EXECUTABLE",steps:[capability,bonus("CONSTRUCTION:"+e.element.toUpperCase(),1)]};
    return {status:"DESCRIPTION_ONLY",steps:[capability],
      reason:"Capacidad modular declarativa, sin bonificación automática ni resolutor de acción"};
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
    case "COPY_SKILL": {
      const modes=["PERMANENT","TEMPORARY","IMITATION","COLLECTION"] as const;
      const mode=String(e.copyMode??"PERMANENT");
      const cap=e.copyCapacity??5,turns=e.copyDurationTurns??3,fidelity=e.copyFidelityPercent??100;
      if(!modes.some(x=>x===mode)||!Number.isSafeInteger(value)||
         !Number.isSafeInteger(cap)||Number(cap)<1||Number(cap)>100||
         !Number.isSafeInteger(turns)||Number(turns)<1||Number(turns)>100||
         !Number.isSafeInteger(fidelity)||Number(fidelity)<1||Number(fidelity)>100||
         (e.copyAllowSpecial!==undefined&&typeof e.copyAllowSpecial!=="boolean")||
         (e.copyAllowRacial!==undefined&&typeof e.copyAllowRacial!=="boolean"))
        return {status:"UNSUPPORTED",steps:[],reason:"Parámetros de copia no válidos"};
      return {status:"EXECUTABLE",steps:[
        bonus("COPY_MAX_PCH",value),
        bonus("COPY_MODE:"+mode,1),
        bonus("COPY_CAPACITY",Number(cap)),
        bonus("COPY_DURATION_TURNS",Number(turns)),
        bonus("COPY_FIDELITY_PERCENT",Number(fidelity)),
        bonus("COPY_ALLOW_SPECIAL",e.copyAllowSpecial===false?0:1),
        bonus("COPY_ALLOW_RACIAL",e.copyAllowRacial===true?1:0),
      ]};
    }
    case "STEAL_SKILL":
      return {status:"UNSUPPORTED",steps:[],reason:"El robo requiere un resolutor de autorización y voluntad"};
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
    const mechanics=row.mechanics&&typeof row.mechanics==="object"&&!Array.isArray(row.mechanics)
      ?row.mechanics as Record<string,unknown>:null;
    const resistance=mechanics?.variableResistance;
    const dynamic=source==="skill"&&row.category==="PASSIVE"&&
      (e as Record<string,unknown>)?.type==="NARRATIVE" &&
      resistance!==undefined && validateVariableResistance(resistance)===null;
    // The existing Sikatā parent/activation check stays in attachedCreationPassive;
    // a dynamic block is resolved only when a block is actually defending.
    const steps:MicroStep[]=dynamic?
      [...projection.steps,{kind:"VARIABLE_RESISTANCE",config:resistance as VariableResistance}]:projection.steps;
    const modules:EffectContainer[]=steps.length?[{
      id:"LEGACY_"+id+"_"+index,name:name+" / "+effectType,type:"LEGACY_MICRO",
      description:typeof (e as Record<string,unknown>)?.description==="string"
        ?String((e as Record<string,unknown>).description).slice(0,2000):"Versión modular de prueba",
      trigger:"PASSIVE",steps,
    }]:[];
    const error=validateEffectContainers(modules);
    if(error)throw new Error(error);
    return {sourceIndex:index,sourceType:effectType,
      status:dynamic?"EXECUTABLE":projection.status,
      ...(dynamic?{reason:"Defensa dinámica conectada al resolutor de construcciones autorizado"}:
        projection.reason?{reason:projection.reason}:{}),modules};
  });
  const coverage=parts.every(p=>p.status==="EXECUTABLE")?"COMPLETE":
    parts.some(p=>p.status==="EXECUTABLE")?"PARTIAL":"UNSUPPORTED";
  const ruleString=(key:string)=>typeof row[key]==="string"?String(row[key]):undefined;
  return {origin:{source,id,name},label:name+" · copia modular",
    enabled:false,uncharged:true,parts,coverage,
    represented:parts.every(p=>p.modules.length>0),
    rules:{
      category:ruleString("category"),condition:ruleString("condition"),
      duration:ruleString("duration"),cooldown:ruleString("cooldown"),
      maintenanceCost:typeof row.maintenanceCost==="number"?row.maintenanceCost:undefined,
      mechanics:row.mechanics&&typeof row.mechanics==="object"&&!Array.isArray(row.mechanics)
        ?structuredClone(row.mechanics as Record<string,unknown>):undefined,
    },
  };
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

/**
 * Server-side COPY_SKILL capability reconstructed exclusively from a validated
 * modular clone. The existing copy authorization/persistence routines remain
 * responsible for checking skill ownership, price, approval and limits.
 */
export function legacyShadowCopyConfig(raw:unknown):{
  type:"COPY_SKILL";value:number;copyMode:"PERMANENT"|"TEMPORARY"|"IMITATION"|"COLLECTION";
  copyCapacity:number;copyDurationTurns:number;copyFidelityPercent:number;
  copyAllowSpecial:boolean;copyAllowRacial:boolean;
}|null{
  const projection=modularStepsForLegacyEffect(raw);
  if(projection.status!=="EXECUTABLE" || !raw || typeof raw!=="object" || Array.isArray(raw) ||
    (raw as {type?:unknown}).type!=="COPY_SKILL")return null;
  const intents=evaluateLegacyShadowParts([{
    sourceIndex:0,sourceType:"COPY_SKILL",status:"EXECUTABLE",
    modules:[{id:"COPY_SHADOW",name:"Capacidad de copia",type:"LEGACY_MICRO",
      description:"",trigger:"PASSIVE",steps:projection.steps}]
  }]);
  const values=new Map<string,number>();
  for(const intent of intents){
    if(intent.kind!=="BONUS" || values.has(intent.stat))return null;
    values.set(intent.stat,intent.amount);
  }
  const mode=["PERMANENT","TEMPORARY","IMITATION","COLLECTION"].find(m=>
    values.get("COPY_MODE:"+m)===1) as "PERMANENT"|"TEMPORARY"|"IMITATION"|"COLLECTION"|undefined;
  if(!mode || values.size!==7)return null;
  return {type:"COPY_SKILL",value:values.get("COPY_MAX_PCH")!,
    copyMode:mode,copyCapacity:values.get("COPY_CAPACITY")!,
    copyDurationTurns:values.get("COPY_DURATION_TURNS")!,
    copyFidelityPercent:values.get("COPY_FIDELITY_PERCENT")!,
    copyAllowSpecial:values.get("COPY_ALLOW_SPECIAL")===1,
    copyAllowRacial:values.get("COPY_ALLOW_RACIAL")===1,
  };
}

/** Use the same pure modular step for the approved construction passive that
 * the shadow gallery displays. Authorization/ownership remains in constructs.ts.
 * The returned value is numeric, never a client-provided defense claim.
 */
export function calculateModularVariableResistance(config:VariableResistance,base:number,input:number):{
  multiplier:number;resistance:number;
}{
  if(validateVariableResistance(config))throw new Error("Resistencia variable no autorizada.");
  if(!Number.isFinite(base)||base<0||!Number.isFinite(input)||input<0)
    throw new Error("Defensa y velocidad/entrada inválidas.");
  const effect:EffectContainer={
    id:"CONSTRUCTION_DYNAMIC_RESISTANCE",name:"Resistencia dinámica",
    type:"PASSIVE",description:"",trigger:"PASSIVE",
    steps:[{kind:"VARIABLE_RESISTANCE",config}],
  };
  const result=executeMicroEvent(emptyMicroState(),[effect],{
    eventId:"CONSTRUCTION_RESOLVE",ownerId:1,trigger:"PASSIVE",
    stats:{HP:0,MAX_HP:1,[config.baseStat]:base},
    event:{[config.input]:input},
  });
  const intent=result.intents[0];
  if(intent?.kind!=="VARIABLE_RESISTANCE"||result.intents.length!==1)
    throw new Error("El módulo de defensa no produjo una resistencia válida.");
  return {multiplier:intent.multiplier,resistance:intent.resistance};
}
