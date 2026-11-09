import {cooldownTurns} from "../skills/cooldown.ts";
import {legacyShadowCombatNumbers} from "../effects/legacy-modular-shadow.ts";
import {isComposedSkillEffect} from "../skills/composed-effects.ts";
import {compileApprovedSupportActivation,type ApprovedSupportActivation} from "./approved-support-activation.ts";
import {compileApprovedHostileStatus,type ApprovedHostileStatus} from "./approved-hostile-status.ts";
import {decideModularExecution,type ModularCutoverMode} from "../effects/modular-cutover.ts";
import {skillEffectMultiplier} from "../skills/pch.ts";
import {parseConfiguredSkillRange} from "./skill-range.ts";
import {compileCombatAttackArea,type CombatAttackArea} from "./skill-area.ts";
import {parseSkillArea} from "../skills/area-of-effect.ts";
import {creationPlanFromEffect,type ConstructionPlan} from "./constructs.ts";
import {compileSummonTemplates,type SummonTemplate} from "./summons.ts";
import {compileFusionPlan,type FusionPlan} from "./chaos-fusion.ts";
import {compileChargeBuff,type ChargeBuffPlan} from "./charge-buffs.ts";
import type {VariableResistance} from "../skills/variable-resistance.ts";
import type {CombatAttackType} from "./matchup-types.ts";

export type CombatBuffStat = "physicalAttack"|"magicAttack"|"physicalDefense"|"magicDefense"|"precision"|"dodge";
export type CombatSkillPlan = {
 id:number;name:string;cost:number;category:"OFFENSE"|"SUPPORT"|"CONSTRUCTION"|"SUMMON"|"CHARGE_BUFF"|"FUSION";
 /** Linked approved parent skill, but not by itself an active combat effect. */
 requiredParentSkillId?:number;
 construction?:ConstructionPlan;
 /** Server-approved creatures; costs are paid individually. */
 summons?:SummonTemplate[];
  chargeBuff?:ChargeBuffPlan;
 fusion?:FusionPlan;
 /** Runtime-validated, staff-reviewed self-only modular activation. */
 approvedActivation?:ApprovedSupportActivation;
 /** D2.4: server-approved status rider, gated by official offensive contact. */
 approvedHostileStatus?:ApprovedHostileStatus;
 creationPassive?:{sourceSkillId:number;resistance:VariableResistance};
 /** Executable persistent mirror with one automatic ray per owner's round. */
 mirror?:{rayMultiplier:number;reflectionMultiplier:number;durability:number};
 attackType?:CombatAttackType;usesMagic?:boolean;damageElement?:string;
 /** Explicit server-derived circular footprint; undefined means legacy single-target. */
 attackArea?:CombatAttackArea;
 rangeMeters:number;damageMultiplier:number;defenseFactor:number;finalMultiplier:number;
 healing:number;bonuses:{stat:CombatBuffStat;value:number}[];
 durationTurns:number;cooldownRounds:number;oncePerCombat:boolean;
 /** Number-only effects are resolved by the micro interpreter when parity holds. */
 microEquivalent?:boolean;
 /** Switch is global; fallback protects every unsupported skill without changing its row. */
 executionEngine?:"MODULAR"|"LEGACY_FALLBACK"|"LEGACY_ROLLBACK";
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
export function compileCombatSkill(row:Record<string,unknown>,cutover:ModularCutoverMode="MODULAR_FIRST"):CombatSkillPlan {
 const id=Number(row.id);
 if(!Number.isSafeInteger(id)||id<1||row.status!=="APPROVED")
  fail("Solo puedes utilizar habilidades aprobadas.");
 if(row.category==="PASSIVE")fail("Las pasivas no se lanzan como acciones.");
 if(typeof row.condition==="string"&&row.condition.trim())
  fail("Las condiciones narrativas de esta habilidad todavía no tienen resolutor.");
 const mechanics=(row.mechanics&&typeof row.mechanics==="object"&&!Array.isArray(row.mechanics))
   ?row.mechanics as Record<string,unknown>:{};
 // A parentSkillId is an ownership/prerequisite link, not an action or
 // an advanced mechanics rule. Its presence alone must not disable an attack.
 const linkedParent=mechanics.parentSkillId;
 if(linkedParent!==undefined && linkedParent!==null &&
    (!Number.isSafeInteger(linkedParent)||Number(linkedParent)<=0||linkedParent===id))
  fail("Referencia de habilidad vinculada inválida.");
 const requiredParentSkillId=linkedParent===undefined||linkedParent===null
  ?undefined:Number(linkedParent);
 if((Array.isArray(mechanics.rules)&&mechanics.rules.length>0)
   ||(Array.isArray(mechanics.activationConditions)&&mechanics.activationConditions.length>0)
   ||mechanics.variableResistance)
  fail("Esta habilidad necesita el resolutor de mecánicas avanzadas.");
 const cost=Number(row.cost);
 if(!Number.isSafeInteger(cost)||cost<0||cost>1000000)
  fail("Coste de maná inválido.");
 const effects=Array.isArray(row.effect)?row.effect:[];
 if(effects.length<1||effects.length>20)
  fail("La habilidad necesita efectos configurados válidos.");
 // A composed hostile status is an ATTACK RIDER: no effect is applied at
 // cast time. The authoritative pending attack must first hit the opponent
 // and deal real HP damage after geometry, defense and physical cover.
 if(row.category==="OFFENSIVE"&&effects.some(isComposedSkillEffect)){
  const approvedHostileStatus=compileApprovedHostileStatus(row,cutover);
  const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
  if(cooldown&&!["Sin cooldown","Una vez por combate","Igual a duración",
    "1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
   fail("Cooldown modular no reconocido.");
  return {
   id,name:typeof row.name==="string"?row.name.slice(0,120):"Ataque con estado",
   cost,requiredParentSkillId,category:"OFFENSE",
   attackType:row.attackType as CombatAttackType,usesMagic:false,
   rangeMeters:parseConfiguredSkillRange(row.areaOfEffect).rangeMeters!,
   damageMultiplier:1,defenseFactor:1,finalMultiplier:1,
   healing:0,bonuses:[],durationTurns:approvedHostileStatus.durationTurns,
   cooldownRounds:cooldownTurns(cooldown,String(row.duration??"")),
   oncePerCombat:cooldown==="Una vez por combate",
   approvedHostileStatus,executionEngine:"MODULAR",
  };
 }
 // Only a fully reviewed COMPOSED support skill can use the ACTIVATE
 // interpreter. Unsupported/mixed modules fail closed instead of falling
 // back to an unrelated free legacy effect.
 if(row.category==="SUPPORT"&&effects.every(isComposedSkillEffect)&&
    effects.every(e=>e.module.trigger==="ACTIVATE")&&
    effects.some(e=>e.module.steps.some(step=>
      step.kind==="HEAL"||step.kind==="BONUS"||step.kind==="APPLY_STATUS"))){
  const approvedActivation=compileApprovedSupportActivation(row,cutover);
  const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
  if(cooldown&&!["Sin cooldown","Una vez por combate","Igual a duración",
    "1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
    fail("Cooldown modular no reconocido.");
  const duration=String(row.duration??"");
  return {
   id,name:typeof row.name==="string"?row.name.slice(0,120):"Soporte modular",
   cost,requiredParentSkillId,category:"SUPPORT",
   rangeMeters:0,damageMultiplier:1,defenseFactor:1,finalMultiplier:1,
   healing:0,bonuses:[],durationTurns:approvedActivation.durationTurns,
   cooldownRounds:cooldownTurns(cooldown,duration),
   oncePerCombat:cooldown==="Una vez por combate",
   approvedActivation,executionEngine:"MODULAR",
  };
 }
 const fusion=compileFusionPlan(effects,cost);
 if(fusion){
   if(Number(row.maintenanceCost??0)!==fusion.summon.maintenanceMana)
     fail("El mantenimiento de la habilidad debe coincidir con el del ser fusionado.");
   const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
   if(cooldown&&!["Sin cooldown","Una vez por combate","Igual a duración","1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
     fail("Cooldown no reconocido.");
   const duration=String(row.duration??"").trim();
   if(duration&&duration!=="0 turnos"&&duration!==fusion.summon.durationTurns+" turnos"&&
      duration!==fusion.summon.durationTurns+" turno")
     fail("La duración de la fusión no coincide con la configuración de la habilidad.");
   return {
     id,name:typeof row.name==="string"?row.name.slice(0,120):"Fusión de entidades",
     cost,requiredParentSkillId,category:"FUSION",fusion,
     rangeMeters:fusion.summon.controlRangeMeters,damageMultiplier:1,
     defenseFactor:1,finalMultiplier:1,healing:0,bonuses:[],
     durationTurns:fusion.summon.durationTurns,
     cooldownRounds:cooldownTurns(cooldown,String(row.duration??"")),
     oncePerCombat:cooldown==="Una vez por combate",usesMagic:false,
   };
 }
 const charged=compileChargeBuff(effects,cost);
 if(charged){
   if(Number(row.maintenanceCost??0)!==0)
     fail("La potenciación por cargas no admite mantenimiento de maná.");
   const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
   if(cooldown&&!["Sin cooldown","Una vez por combate","Igual a duración","1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
     fail("Cooldown no reconocido.");
   const duration=String(row.duration??"").trim();
   if(duration && duration!=="0 turnos" && duration!==charged.durationTurns+" turnos"&&
     duration!==charged.durationTurns+" turno")
     fail("La duración de la habilidad no coincide con el efecto de cargas.");
   return {
     id,name:typeof row.name==="string"?row.name.slice(0,120):"Potenciación de cargas",
     cost,requiredParentSkillId,category:"CHARGE_BUFF",chargeBuff:charged,
     rangeMeters:0,damageMultiplier:1,defenseFactor:1,finalMultiplier:1,
     healing:0,bonuses:[],durationTurns:charged.durationTurns,
     cooldownRounds:cooldownTurns(cooldown,String(row.duration??"")),
     oncePerCombat:cooldown==="Una vez por combate",usesMagic:false,
   };
 }
 const summonTemplates=compileSummonTemplates(effects,cost);
 if(summonTemplates){
   const expectedMaintenance=summonTemplates.reduce((sum,t)=>sum+t.maintenanceMana,0);
   if(Number(row.maintenanceCost??0)!==expectedMaintenance)
     fail("El mantenimiento de la habilidad debe sumar "+expectedMaintenance+" maná por turno.");
   const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
   if(cooldown&&
     !["Sin cooldown","Una vez por combate","Igual a duración","1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
     fail("Cooldown no reconocido.");
   const durationTurns=Math.max(...summonTemplates.map(t=>t.durationTurns));
   return {
     id,name:typeof row.name==="string"?row.name.slice(0,120):"Invocación",
     cost,requiredParentSkillId,category:"SUMMON",summons:summonTemplates,
     rangeMeters:Math.max(...summonTemplates.map(t=>t.controlRangeMeters)),
     damageMultiplier:1,defenseFactor:1,finalMultiplier:1,healing:0,bonuses:[],
     durationTurns,cooldownRounds:cooldownTurns(cooldown,String(row.duration??"")),
     oncePerCombat:cooldown==="Una vez por combate",usesMagic:false,
   };
 }
 const range=parseConfiguredSkillRange(row.areaOfEffect);
 const name=typeof row.name==="string"?row.name.slice(0,120):"Habilidad";
 let mode:"PHYSICAL"|"MAGICAL"|null=null;
 let damageElement:string|undefined;
 let multiplier=1,defenseFactor=1,final=1,healing=0;
 let construction:ConstructionPlan|undefined;
 const mirrorEffects=new Map<string,number>();
 const bonuses:{stat:CombatBuffStat;value:number}[]=[];
 for(const entry of effects){
  if(!entry||typeof entry!=="object")fail("Efecto de habilidad inválido.");
  const e=entry as Record<string,unknown>;
  if(!positive(e.value))fail("Potencia de habilidad inválida.");
  const value=e.value as number, target=String(e.target??"");
  switch(String(e.type)){
   case "SUMMON_MIRROR":
   case "MIRROR_RAY":
   case "MAGIC_REFLECTION": {
    const effectType=String(e.type);
    if(mirrorEffects.has(effectType))fail("La habilidad contiene un efecto de espejo duplicado.");
    if(value>1000)fail("El poder del espejo excede el límite permitido.");
    mirrorEffects.set(effectType,value);
    break;
   }
   case "DAMAGE_MULTIPLIER":{
    const kind=["PHYS_ATK","PHYSICAL_ATTACK"].includes(target)?"PHYSICAL":
      ["MAGIC_ATK","MAGIC_ATTACK"].includes(target)?"MAGICAL":null;
    if(!kind||mode&&mode!==kind)fail("Tipo de daño ambiguo o no implementado.");
    mode=kind;
    if(typeof e.element==="string" && e.element.trim() && e.element!=="NEUTRAL"){
      const chosen=e.element.toUpperCase();
      if(damageElement && chosen!==damageElement)fail("Una habilidad ofensiva no puede tener dos elementos de daño incompatibles.");
      damageElement=chosen;
    }
    multiplier*=skillEffectMultiplier("DAMAGE_MULTIPLIER",value);
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
   case "NARRATIVE": {
    const create=creationPlanFromEffect(e);
    if(create===null)throw new Error("Este efecto narrativo no crea una construcción ejecutable.");
    if(construction)fail("Una habilidad solo puede crear un objeto por ejecución.");
    construction=create;
    break;
   }
   default:fail("Este efecto todavía no puede ejecutarse en combate: "+e.type);
  }
 }
 let mirror:CombatSkillPlan["mirror"];
 if(mirrorEffects.size>0){
  if(mirrorEffects.size!==3||!["SUMMON_MIRROR","MIRROR_RAY","MAGIC_REFLECTION"].every(k=>mirrorEffects.has(k)))
   fail("El espejo necesita invocación, rayo y reflexión configurados.");
  if(mirrorEffects.get("SUMMON_MIRROR")!==1)
   fail("La invocación de varios espejos en una sola acción requiere una posición por espejo.");
  if(effects.length!==3||mode!==null||construction||bonuses.length>0||healing>0)
   fail("La invocación de espejo no admite efectos adicionales sin resolutor.");
  if(row.attackType!=="PIERCE")
   fail("El rayo de espejo requiere un ataque mágico de perforación.");
  if(range.rangeMeters===null||range.rangeMeters<=0)
   fail("El espejo necesita alcance máximo válido.");
  construction={material:"MIRROR",label:"Espejo mágico"};
  mirror={rayMultiplier:mirrorEffects.get("MIRROR_RAY")!/100,
   reflectionMultiplier:mirrorEffects.get("MAGIC_REFLECTION")!/100,
   durability:mirrorEffects.get("SUMMON_MIRROR")!};
 }
 const isAttack=mode!==null;
 if(isAttack && !["SINGLE","CONTACT","CIRCLE","STRIP","CONE","SWEEP","SELF_FIELD"].includes(parseSkillArea(range.area).kind))
  fail("El área ofensiva necesita una geometría compatible (objetivo, contacto, círculo, franja, cono, arco o campo personal).");
 const attackArea=isAttack?compileCombatAttackArea(range.area,range.rangeMeters):undefined;
 if(attackArea?.shape==="SELF_FIELD" && mode!=="PHYSICAL")
  fail("El barrido alrededor del usuario requiere un ataque físico.");
 if(mirror&&compileCombatAttackArea(range.area))
  fail("El espejo no admite un área ofensiva adicional.");
 if(construction&&(isAttack||bonuses.length>0||healing>0))
  fail("Combinar la construcción con otros efectos requiere un resolutor propio.");
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
 }else if(bonuses.length===0&&healing===0&&!construction)fail("La habilidad no contiene efectos ejecutables.");
 const duration=String(row.duration??"");
 const parsed=/^(\d+) turnos?$/.exec(duration.trim());
 const durationTurns=parsed?Number(parsed[1]):0;
 if(bonuses.length>0&&(!Number.isSafeInteger(durationTurns)||durationTurns<1||durationTurns>20))
  fail("Los bonos temporales requieren una duración de 1 a 20 turnos.");

 // Execute the independent modular clone in parallel with the legacy parser.
 // Only use the micro-derived numeric plan when every supported intent matches
 // the authoritative parser; unresolved narrative/special actions retain the
 // original engine, without an implicit conversion.
 const shadow=legacyShadowCombatNumbers(effects);
 const same=(a:number,b:number)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
 const shadowEquivalent=Boolean(shadow &&
   same(shadow.damageMultiplier,multiplier) &&
   same(shadow.defenseFactor,defenseFactor) &&
   same(shadow.finalMultiplier,final) &&
   same(shadow.healing,healing) &&
   shadow.bonuses.length===bonuses.length &&
   shadow.bonuses.every((b,i)=>b.stat===bonuses[i].stat&&same(b.value,bonuses[i].value)) &&
   (construction ? (mirror ? shadow.constructionMaterial===undefined : shadow.constructionMaterial===construction.material) : shadow.constructionMaterial===undefined) &&
   (mirror
     ? Boolean(shadow.mirror&&same(mirror.durability,shadow.mirror.durability)&&
       same(mirror.rayMultiplier,shadow.mirror.rayMultiplier)&&
       same(mirror.reflectionMultiplier,shadow.mirror.reflectionMultiplier))
     : shadow.mirror===undefined)
 );
 const executionEngine=decideModularExecution(cutover,shadowEquivalent);
 if(executionEngine==="MODULAR" && shadow){
   multiplier=shadow.damageMultiplier;
   defenseFactor=shadow.defenseFactor;
   final=shadow.finalMultiplier;
   healing=shadow.healing;
   // Stats keep the validated CombatBuffStat aliases from the legacy compiler.
   bonuses.splice(0,bonuses.length,...shadow.bonuses.map((b,i)=>({stat:bonuses[i].stat,value:b.value})));
   if(mirror && shadow.mirror)mirror=shadow.mirror;
 }

 const cooldown=typeof row.cooldown==="string"?row.cooldown:null;
 if(cooldown && !["Sin cooldown","Una vez por combate","Igual a duración","1 turno","2 turnos","3 turnos","5 turnos","10 turnos"].includes(cooldown))
  fail("Cooldown no reconocido.");
 const limit=Math.max(multiplier,defenseFactor,final);
 if(!Number.isFinite(limit)||limit>1000||healing>1000000)
  fail("La combinación de potencias supera los límites del motor.");
 return {
  id,name,cost,requiredParentSkillId,category:construction?"CONSTRUCTION":isAttack?"OFFENSE":"SUPPORT",construction,mirror,
  attackType:isAttack?String(row.attackType) as CombatAttackType:undefined,
  usesMagic:mode==="MAGICAL"||Boolean(mirror),damageElement:isAttack?damageElement:undefined,
  attackArea:attackArea??undefined,rangeMeters:range.rangeMeters??0,
  damageMultiplier:multiplier,defenseFactor,finalMultiplier:final,
  healing,bonuses,durationTurns,cooldownRounds:cooldownTurns(cooldown,duration),
  oncePerCombat:cooldown==="Una vez por combate",microEquivalent:shadowEquivalent,
  executionEngine,
 };
}

/** Expose eligibility and specific unsupported reason without claiming the
 * character may bypass requirements or pending approvals. */
export function previewSkillExecution(row:Record<string,unknown>,cutover:ModularCutoverMode="MODULAR_FIRST"){
 try {
  const plan=compileCombatSkill(row,cutover);
  return {executable:true as const,skillKind:plan.category,
    chargeBuff:plan.chargeBuff??null,
    fusion:plan.fusion??null,
    modularSupport:Boolean(plan.approvedActivation),
    modularHostileStatus:Boolean(plan.approvedHostileStatus),
   needsAim:plan.category!=="SUPPORT"&&plan.category!=="SUMMON"&&plan.category!=="CHARGE_BUFF"&&plan.category!=="FUSION"&&plan.attackArea?.shape!=="SELF_FIELD",usesMagic:plan.usesMagic===true,
   attackArea:plan.attackArea??null,
   constructionMaterial:plan.construction?.material??null,
   disabledReason:null};
 }catch(e) {
  return {executable:false as const,skillKind:null,
    chargeBuff:null,
    fusion:null,
    modularSupport:false,
    modularHostileStatus:false,
   needsAim:false,usesMagic:false,attackArea:null,
   disabledReason:e instanceof Error?e.message:"No disponible."};
 }
}
