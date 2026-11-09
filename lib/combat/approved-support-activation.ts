/**
 * D2.2: deliberately bounded, staff-priced COMPOSED support activation.
 * Only approved, reviewed, SELF-targeted, non-maintained skills can issue
 * HEAL or temporary BONUS intents. The combat engine owns PA, ticks, mana,
 * cooldowns and persistence. Damage, targets, spells and repairs are rejected.
 */
import {emptyMicroState,executeMicroEvent,validateEffectContainers,
 type EffectContainer,type MicroStep,type NumericExpr} from "../effects/micro-modules.ts";
import {isComposedSkillEffect,validateComposedSkillList,
 type ComposedSkillEffect} from "../skills/composed-effects.ts";
import {parseSkillArea} from "../skills/area-of-effect.ts";
import type {CombatBuffStat} from "./skill-casting.ts";
import type {CombatFighter,Side} from "./turn-engine.ts";
import type {ModularCutoverMode} from "../effects/modular-cutover.ts";

export type ApprovedSupportActivation={
 definitions:EffectContainer[];
 durationTurns:number;
};
const ALLOWED_STATS=new Set(["HP","MAX_HP","STR","PHYSICAL_DEFENSE",
 "MAGIC_DEFENSE","PHYSICAL_ATTACK","MAGIC_ATTACK","PRECISION","DODGE"]);
const BONUS_KEYS:Record<string,CombatBuffStat>={
 PHYSICAL_ATTACK:"physicalAttack",MAGIC_ATTACK:"magicAttack",
 PHYSICAL_DEFENSE:"physicalDefense",MAGIC_DEFENSE:"magicDefense",
 PRECISION:"precision",DODGE:"dodge",
};
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const object=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==="object"&&!Array.isArray(x);

/** Reject EVENT/CHARGES/STORED_TOTAL and inaccessible character-sheet fields.
 * OUTPUT references are already ordered and cycle-checked by the interpreter.
 */
function expressionSafe(value:NumericExpr,depth=0):boolean{
 if(depth>12)return false;
 if(typeof value==="number")return finite(value)&&Math.abs(value)<=100000;
 if(!object(value))return false;
 if("source" in value)return value.source==="OUTPUT"&&typeof value.key==="string"||
  value.source==="STAT"&&ALLOWED_STATS.has(String(value.key));
 return "operator" in value&&Array.isArray(value.args)&&value.args.length<=8&&
  value.args.every((arg:NumericExpr)=>expressionSafe(arg,depth+1));
}
function supportedStep(step:MicroStep):boolean{
 if(step.when!==undefined)return false;
 switch(step.kind){
  case "READ_STAT":return step.actor==="USER"&&ALLOWED_STATS.has(step.stat);
  case "CALCULATE":return expressionSafe(step.expression);
  case "HEAL":return expressionSafe(step.amount);
  case "BONUS":return Object.prototype.hasOwnProperty.call(BONUS_KEYS,step.stat)
    &&expressionSafe(step.amount);
  // External statuses await official defender reactions and target resolution.
  case "SELECT_TARGET":return step.selector==="USER";
  case "APPLY_STATUS":return step.target?.source==="OUTPUT"&&
    typeof step.stat==="string"&&
    Object.prototype.hasOwnProperty.call(BONUS_KEYS,step.stat)&&
    (step.operation==="BONUS"||step.operation==="MULTIPLIER")&&
    Number.isSafeInteger(step.durationTurns)&&step.durationTurns>=1&&
    step.durationTurns<=20&&expressionSafe(step.value);
  default:return false;
 }
}
/** Raises an actionable Spanish reason for a skill listed in the combat UI. */
export function compileApprovedSupportActivation(
 row:Record<string,unknown>,cutover:ModularCutoverMode
):ApprovedSupportActivation{
 const error=(message:string):never=>{throw new Error(message);};
 if(cutover==="LEGACY_ONLY")
  return error("Las habilidades modulares nuevas están desactivadas en el modo de seguridad anterior.");
 if(row.status!=="APPROVED"||row.approvedAt==null||
  !Number.isSafeInteger(row.pchCost)||Number(row.pchCost)<1)
  return error("Esta habilidad modular necesita aprobación y PCH revisado por administración.");
 if(row.category!=="SUPPORT")return error("Este tipo de habilidad modular todavía no tiene un resolutor de combate.");
 const cost=Number(row.cost);
 if(!Number.isSafeInteger(cost)||cost<1||cost>1000000)
  return error("La habilidad modular de soporte necesita un coste de maná positivo.");
 if(Number(row.maintenanceCost??0)!==0||
    Number(row.accumulationCost??0)!==0||Number(row.accumulationPerTick??0)!==0)
  return error("El soporte modular con mantenimiento o acumulación aún no está implementado.");
 if(parseSkillArea(row.areaOfEffect).kind!=="SELF")
  return error("Por ahora el soporte modular debe tener el área Personal (usuario).");
 const mechanics=object(row.mechanics)?row.mechanics:{};
 if(Object.keys(mechanics).some(key=>key!=="parentSkillId"))
  return error("Esta habilidad necesita el resolutor de mecánicas avanzadas.");
 if(typeof row.condition==="string"&&row.condition.trim())
  return error("La condición narrativa de esta habilidad todavía no tiene resolutor.");
 const effects=row.effect;
 if(!Array.isArray(effects)||effects.length<1||effects.length>4||
  !effects.every(isComposedSkillEffect))
  return error("El soporte modular admite de uno a cuatro efectos COMPOSED, sin mezclas.");
 const review=validateComposedSkillList(effects,"REVIEW");
 if(review)return error(review);
 const definitions=(effects as ComposedSkillEffect[]).map(e=>structuredClone(e.module));
 const graphError=validateEffectContainers(definitions);
 if(graphError)return error(graphError);
 let healCount=0,bonusCount=0,statusCount=0,stepCount=0;
 for(const effect of definitions){
  if(effect.trigger!=="ACTIVATE"||effect.requirements!==undefined||
    effect.impactKind!==undefined)
   return error("Por ahora los efectos modulares deben ejecutarse al activar, sin blancos ni condiciones avanzadas.");
  for(const step of effect.steps){
   stepCount++;
   if(!supportedStep(step))
    return error("Este micromódulo todavía no se puede ejecutar como soporte personal en combate.");
   if(step.kind==="HEAL")healCount++;
   if(step.kind==="BONUS")bonusCount++;
   if(step.kind==="APPLY_STATUS")statusCount++;
  }
 }
 if(stepCount>12||healCount>1||bonusCount+statusCount>4||
    statusCount>2||healCount+bonusCount+statusCount===0)
  return error("El soporte modular admite una curación, hasta dos estados propios y cuatro mejoras en total, con máximo doce pasos.");
 const duration=String(row.duration??"").trim();
 const turns=/^(\d+) turnos?$/.exec(duration);
 const durationTurns=turns?Number(turns[1]):0;
 if(bonusCount+statusCount>0&&(!Number.isSafeInteger(durationTurns)||durationTurns<1||durationTurns>20))
  return error("Los bonos y estados temporales necesitan una duración de 1 a 20 turnos.");
 if(statusCount>0&&definitions.some(effect=>effect.steps.some(step=>
   step.kind==="APPLY_STATUS"&&step.durationTurns!==durationTurns)))
  return error("Los estados modulares deben coincidir con la duración de la habilidad.");
 if(bonusCount+statusCount===0&&!["","Instantánea","0 turnos"].includes(duration))
  return error("Una curación instantánea no puede declarar una duración recurrente.");
 return {definitions,durationTurns};
}
export type ApprovedActivationResult={
 hp:number;healed:number;bonuses:Array<{stat:CombatBuffStat;value:number}>;
 statuses:Array<{stat:CombatBuffStat;operation:"MULTIPLIER"|"BONUS";
   value:number;durationTurns:number}>;
};
export function resolveApprovedSupportActivation(
 definition:ApprovedSupportActivation,fighter:CombatFighter,side:Side
):ApprovedActivationResult{
 const stats:Record<string,number>={
  HP:fighter.hp,MAX_HP:fighter.maxHp,STR:fighter.strength,
  PHYSICAL_DEFENSE:fighter.physicalDefense,MAGIC_DEFENSE:fighter.magicDefense,
  PHYSICAL_ATTACK:fighter.physicalAttack,MAGIC_ATTACK:fighter.magicAttack,
  PRECISION:fighter.precision,DODGE:fighter.dodge,
 };
 const result=executeMicroEvent(emptyMicroState(),definition.definitions,{
  eventId:"CastSupport",ownerId:side==="PLAYER"?1:2,trigger:"ACTIVATE",
  stats,actors:{USER:stats},
 });
 const bonuses:ApprovedActivationResult["bonuses"]=[];
 const statuses:ApprovedActivationResult["statuses"]=[];
 let requestedHeal=0,bonusTotal=0;
 for(const intent of result.intents){
  if(intent.kind==="HEAL"){
   requestedHeal+=intent.requested;
  }else if(intent.kind==="BONUS"){
   const stat=BONUS_KEYS[intent.stat];
   if(!stat||!finite(intent.amount)||intent.amount<=0||intent.amount>100)
    throw new Error("El bono modular de combate supera el máximo permitido.");
   bonusTotal+=intent.amount;
   bonuses.push({stat,value:intent.amount});
  }else if(intent.kind==="APPLY_STATUS"){
   // SELECT_TARGET(USER) resolves to this trusted encounter ownerId.
   if(intent.targetId!==(side==="PLAYER"?1:2))
    throw new Error("El estado modular no tiene un objetivo autorizado.");
   const stat=BONUS_KEYS[intent.stat];
   if(!stat||!finite(intent.value)||!Number.isSafeInteger(intent.durationTurns)||
      intent.durationTurns!==definition.durationTurns)
    throw new Error("Estado modular inválido.");
   if(intent.operation==="BONUS"){
    if(intent.value<=0||intent.value>100)
     throw new Error("El estado modular supera el bono permitido.");
    bonusTotal+=intent.value;
   }else if(intent.operation==="MULTIPLIER"){
    if(intent.value<=1||intent.value>1.3)
     throw new Error("El multiplicador modular supera el límite permitido.");
   }else throw new Error("Operación de estado no autorizada.");
   statuses.push({stat,operation:intent.operation,value:intent.value,
     durationTurns:intent.durationTurns});
  }else throw new Error("La habilidad modular contiene una acción sin resolutor autorizado.");
 }
 // Values may depend on the live HP and modular arithmetic. Verify the
 // evaluated amount, not just the editor's literal node.
 if(!finite(requestedHeal)||requestedHeal<0||
    requestedHeal>Math.max(1,fighter.maxHp*0.30)||
    bonusTotal>200||statuses.length>2)
  throw new Error("La curación o los bonos modulares superan los límites del combate.");
 if(!finite(result.hp)||result.hp<fighter.hp||result.hp>fighter.maxHp)
  throw new Error("Resultado de curación modular inválido.");
 return {hp:result.hp,healed:result.hp-fighter.hp,bonuses,statuses};
}
