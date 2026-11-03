import {cooldownTurns} from "../skills/cooldown.ts";
import {skillEffectMultiplier} from "../skills/pch.ts";
import {parseConfiguredSkillRange} from "./skill-range.ts";
import type {CombatAttackType} from "./matchup-types.ts";

export type CombatBuffStat = "physicalAttack"|"magicAttack"|"physicalDefense"|"magicDefense"|"precision"|"dodge";
export type CombatSkillPlan = {
 id:number;name:string;cost:number;category:"OFFENSE"|"SUPPORT";
 attackType?:CombatAttackType;usesMagic?:boolean;
 rangeMeters:number;damageMultiplier:number;defenseFactor:number;finalMultiplier:number;
 healing:number;bonuses:{stat:CombatBuffStat;value:number}[];
 durationTurns:number;cooldownRounds:number;oncePerCombat:boolean;
};
const aliases:Record<string,CombatBuffStat>={
 PHYS_ATK:"physicalAttack",PHYSICAL_ATTACK:"physicalAttack",
 MAGIC_ATK:"magicAttack",MAGIC_ATTACK:"magicAttack",
 DEF:"physicalDefense",PHYSICAL_DEFENSE:"physicalDefense",
 MAG_DEF:"magicDefense",MAGIC_DEFENSE:"magicDefense",
 PRECISION:"precision",DODGE:"dodge",
};
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
const positive=(n:unknown)=>finite(n)&&n>0&&n<=100000;
const fail=(reason:string):never=>{throw new Error(reason);};

/**
 * STRICT allowlist of effects with a complete phase-2 combat interpretation.
 * Never silently discard unsupported or narrative effects, mechanics, or
 * conditions: a skill with unknown actions is NOT executable yet.
 */
export function compileCombatSkill(row:Record<string,unknown>):CombatSkillPlan {
 const id=Number(row.id);
 if(!Number.isSafeInteger(id)||id<1||row.status!=="APPROVED")
  fail("Solo puedes utilizar habilidades aprobadas.");
 if(row.category==="PASSIVE")fail("Las pasivas no se lanzan como acciones.");
 if(typeof row.condition==="string"&&row.condition.trim())
  fail("Las condiciones narrativas de esta habilidad todavía no tienen resolutor.");
 const mechanics=(row.mechanics&&typeof row.mechanics==="object"&&!Array.isArray(row.mechanics))
   ?row.mechanics as Record<string,unknown>:{};
 if((Array.isArray(mechanics.rules)&&mechanics.rules.length>0)
   ||(Array.isArray(mechanics.activationConditions)&&mechanics.activationConditions.length>0)
   ||mechanics.variableResistance || mechanics.parentSkillId)
  fail("Esta habilidad necesita el resolutor de mecánicas avanzadas.");
 const cost=Number(row.cost);
 if(!Number.isSafeInteger(cost)||cost<0||cost>1000000)
  fail("Coste de maná inválido.");
 const effects=Array.isArray(row.effect)?row.effect:[];
 if(effects.length<1||effects.length>20)
  fail("La habilidad necesita efectos configurados válidos.");
 const range=parseConfiguredSkillRange(row.areaOfEffect);
 const name=typeof row.name==="string"?row.name.slice(0,120):"Habilidad";
 let mode:"PHYSICAL"|"MAGICAL"|null=null;
 let multiplier=1,defenseFactor=1,final=1,healing=0;
 const bonuses:{stat:CombatBuffStat;value:number}[]=[];
 for(const entry of effects){
  if(!entry||typeof entry!=="object")fail("Efecto de habilidad inválido.");
  const e=entry as Record<string,unknown>;
  if(!positive(e.value))fail("Potencia de habilidad inválida.");
  const value=e.value as number, target=String(e.target??"");
  switch(String(e.type)){
   case "DAMAGE_MULTIPLIER":{
    const kind=["PHYS_ATK","PHYSICAL_ATTACK"].includes(target)?"PHYSICAL":
      ["MAGIC_ATK","MAGIC_ATTACK"].includes(target)?"MAGICAL":null;
    if(!kind||mode&&mode!==kind)fail("Tipo de daño ambiguo o no implementado.");
    mode=kind; multiplier*=skillEffectMultiplier("DAMAGE_MULTIPLIER",value);
    break;
   }
   case "IGNORE_PHYS_DEF_MULTIPLIER":
    if(mode==="MAGICAL")fail("La ignorancia de defensa no coincide con el tipo de ataque.");
    defenseFactor*=skillEffectMultiplier("IGNORE_PHYS_DEF_MULTIPLIER",value);
    break;
   case "IGNORE_MAGIC_DEF_MULTIPLIER":
    if(mode==="PHYSICAL")fail("La ignorancia de defensa no coincide con el tipo de ataque.");
    defenseFactor*=skillEffectMultiplier("IGNORE_MAGIC_DEF_MULTIPLIER",value);
    break;
   case "FINAL_DAMAGE_MULTIPLIER":
    final*=skillEffectMultiplier("FINAL_DAMAGE_MULTIPLIER",value);break;
   case "RESOURCE_BONUS":
    if(target!=="HP")fail("Por ahora, solo se permite recuperar HP en un encuentro.");
    healing+=value;break;
   case "STAT_BONUS": {
    const stat=aliases[target];
    if(!stat)fail("Estadística temporal todavía no soportada: "+target);
    bonuses.push({stat,value});break;
   }
   default:fail("Este efecto todavía no puede ejecutarse en combate: "+e.type);
  }
 }
 const isAttack=mode!==null;
 if(isAttack && (bonuses.length>0||healing>0))
  fail("Las combinaciones de ataque y soporte requieren un resolutor propio.");
 if(isAttack){
  if(!["CUT","BLUNT","PIERCE"].includes(String(row.attackType)))
   fail("Asigna un tipo de ataque a la habilidad.");
  if(range.rangeMeters===null)
   fail("La habilidad ofensiva necesita un alcance máximo válido.");
  if(mode==="MAGICAL" && effects.some((e:any)=>e.type==="IGNORE_PHYS_DEF_MULTIPLIER"))
   fail("Ignorar defensa física no corresponde a este ataque.");
  if(mode==="PHYSICAL"&&effects.some((e:any)=>e.type==="IGNORE_MAGIC_DEF_MULTIPLIER"))
   fail("Ignorar defensa mágica no corresponde a este ataque.");
 }else if(bonuses.length===0&&healing===0)fail("La habilidad no contiene efectos ejecutables.");
 const duration=String(row.duration??"");
 const parsed=/^(\d+) turnos?$/.exec(duration.trim());
 const durationTurns=parsed?Number(parsed[1]):0;
 if(bonuses.length>0&&(!Number.isSafeInteger(durationTurns)||durationTurns<1||durationTurns>20))
  fail("Los bonos temporales requieren una duración de 1 a 20 turnos.");
 const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
 if(cooldown && !["Sin cooldown","Una vez por combate","Igual a duración","1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
  fail("Cooldown no reconocido.");
 const limit=Math.max(multiplier,defenseFactor,final);
 if(!Number.isFinite(limit)||limit>1000||healing>1000000)
  fail("La combinación de potencias supera los límites del motor.");
 return {
  id,name,cost,category:isAttack?"OFFENSE":"SUPPORT",
  attackType:isAttack?String(row.attackType) as CombatAttackType:undefined,
  usesMagic:mode==="MAGICAL",rangeMeters:range.rangeMeters??0,
  damageMultiplier:multiplier,defenseFactor,finalMultiplier:final,
  healing,bonuses,durationTurns,cooldownRounds:cooldownTurns(cooldown,duration),
  oncePerCombat:cooldown==="Una vez por combate",
 };
}

/** Expose eligibility and specific unsupported reason without claiming the
 * character may bypass requirements or pending approvals. */
export function previewSkillExecution(row:Record<string,unknown>){
 try {
  const plan=compileCombatSkill(row);
  return {executable:true as const,skillKind:plan.category,
   needsAim:plan.category==="OFFENSE",usesMagic:plan.usesMagic===true,
   disabledReason:null};
 }catch(e) {
  return {executable:false as const,skillKind:null,
   needsAim:false,usesMagic:false,
   disabledReason:e instanceof Error?e.message:"No disponible."};
 }
}
