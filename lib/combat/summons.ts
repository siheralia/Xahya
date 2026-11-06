/** Combat-approved subset of general entity micromodules.
 * A summon is NEVER inferred from an effect name or from narrative text.
 * Definitions outside this strict set remain non-executable in combat.
 */
import {validateEffectContainers,type EffectContainer,type EntityBehaviorMode,
  type EntityTargetSlot} from "../effects/micro-modules.ts";
import {resolveStatusStat} from "./summon-status.ts";
import type {CombatFighter,Point,Side} from "./turn-engine.ts";

export type SummonStat = "PHYSICAL_ATTACK"|"PHYSICAL_DEFENSE"|"AGI"|"INTEGRITY"|
  "MOVE_SPEED"|"PRECISION"|"DODGE"|"STRENGTH"|
  "MAGIC_ATTACK"|"MAGIC_DEFENSE"|"CON"|"CRITICAL"|"LUCK"|"RACE"|"MASS_KG";
/** Old encounter links omit mode; they remain dynamically linked. */
export type SummonLink = {sourceStat:string;destStat:SummonStat;factor:number;mode?:"LINK"}
  | {mode:"FIXED";destStat:SummonStat;value:number};
export type SummonStatChoice={mode:"FIXED"|"RANDOM"|"COMBAT";allowed:string[];fixed?:string};
export type SummonContactEffect={
  kind:"APPLY_STATUS";target:EntityTargetSlot;stat:string|SummonStatChoice;
  operation:"MULTIPLIER"|"BONUS";value:number;durationTurns:number;
} | {
  kind:"INVERT_STATUS";target:EntityTargetSlot;
  selection:"LATEST_DEBUFF"|"SELECTED_DEBUFF";manaCost:number;chargeAccumulator?:string;
};
export type SummonBehavior = {mode:EntityBehaviorMode;allowedModes:EntityBehaviorMode[];
  target:EntityTargetSlot;trigger:"CONTACT"|"HP_DAMAGE"|"COMMAND"};
export type SummonTemplate = {
  entityKey:string;label:string;manaCost:number;maintenanceMana:number;
  durationTurns:number;controlRangeMeters:number;hitLimit:number;
  links:SummonLink[];behavior:SummonBehavior;
  contactEffects:SummonContactEffect[];
};
export type CombatSummon = {
  id:string;owner:Side;sourceSkillId:number;entityKey:string;label:string;
  fieldPosition:Point;createdRound:number;expiresAtRound:number;
  controlRangeMeters:number;maintenanceMana:number;
  integrity:number;hitCount:number;hitLimit:number;
  links:SummonLink[];behavior:SummonBehavior;
  contactEffects?:SummonContactEffect[];charges?:Record<string,number>;
  /** Old per-creature charge wallets are copied to the owner pool only once. */
  chargesMigrated?:boolean;
};
const ALLOWED_SOURCE:Record<string,keyof CombatFighter>={
  PHYSICAL_ATTACK:"physicalAttack",PHYSICAL_DEFENSE:"physicalDefense",
  AGI:"agility",MOVE_SPEED:"speedValue",PRECISION:"precision",
  DODGE:"dodge",STR:"strength",STRENGTH:"strength",
  MAGIC_ATTACK:"magicAttack",MAGIC_DEFENSE:"magicDefense",CON:"constitution",
  CRITICAL:"critical",LUCK:"luck",RACE:"race",MASS_KG:"massKg",
};
const ALLOWED_DEST=new Set<SummonStat>([
  "PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI","INTEGRITY",
  "MOVE_SPEED","PRECISION","DODGE","STRENGTH",
  "MAGIC_ATTACK","MAGIC_DEFENSE","CON","CRITICAL","LUCK","RACE","MASS_KG",
]);
const required=["PHYSICAL_ATTACK","AGI","INTEGRITY"] as const;
const acceptableFactor=(f:unknown):f is number=>
  typeof f==="number"&&Number.isFinite(f)&&f>=0&&f<=10;
const isObject=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==="object"&&!Array.isArray(v);

/** Null only when not composed at all. Malformed and mixed effects reject. */
export function compileSummonTemplates(effects:readonly unknown[],skillManaCost:number):SummonTemplate[]|null {
  if(!effects.some(e=>isObject(e)&&e.type==="COMPOSED"))return null;
  if(effects.length>8 || effects.some(e=>!isObject(e)||e.type!=="COMPOSED"||!isObject(e.module)))
    throw new Error("Invocación: no mezcles módulos de criatura con efectos de otro tipo.");
  const modules=effects.map(e=>(e as {module:EffectContainer}).module);
  const error=validateEffectContainers(modules);
  if(error)throw new Error(error);
  const map=new Map<string,SummonTemplate>();
  const behaviors=new Set<string>();
  for(const module of modules){
    let activeEntityKey:string|null=null;
    const targets=new Map<string,EntityTargetSlot>();
    const statChoices=new Map<string,SummonStatChoice>();
    const contactAllowed=new Set<string>();
    if(module.trigger!=="ACTIVATE"||module.impactKind||module.requirements?.length)
      throw new Error("Invocación: los pasos de criatura requieren activación directa sin condiciones pendientes.");
    for(const step of module.steps){
      if(step.when?.length)
        throw new Error("Invocación: los pasos condicionales todavía no tienen resolutor de combate.");
      switch(step.kind){
        case "SUMMON_ENTITY":
          if(map.has(step.entityKey)||map.size>=8)
            throw new Error("Invocación repetida o exceso de ocho criaturas por habilidad.");
          map.set(step.entityKey,{
            entityKey:step.entityKey,label:step.label,manaCost:step.manaCost,
            maintenanceMana:step.maintenanceMana,durationTurns:step.durationTurns,
            controlRangeMeters:step.controlRangeMeters,hitLimit:step.hitLimit,
            links:[],contactEffects:[],
            behavior:{mode:"FOLLOW",allowedModes:["FOLLOW"],target:"USER",trigger:"COMMAND"}
          });
          activeEntityKey=step.entityKey;
          break;
        case "LINK_ENTITY_STAT":{
          const t=map.get(step.entityKey);
          if(!t)throw new Error("Vincula las estadísticas después de invocar su entidad.");
          if(!Object.hasOwn(ALLOWED_SOURCE,step.sourceStat)||!ALLOWED_DEST.has(step.destStat as SummonStat)||
            !acceptableFactor(step.factor))
            throw new Error("Invocación: estadísticas/factor de criatura no soportados por el motor de combate.");
          if(t.links.some(link=>link.destStat===step.destStat))
            throw new Error("Invocación: cada estadística de criatura admite un único valor (fijo o vinculado).");
          if(step.destStat==="INTEGRITY"&&step.sourceStat!=="PHYSICAL_DEFENSE")
            throw new Error("La integridad de una criatura debe vincularse a la defensa física.");
          t.links.push({mode:"LINK",sourceStat:step.sourceStat,
            destStat:step.destStat as SummonStat,factor:step.factor});
          break;
        }
        case "SET_ENTITY_STAT":{
          const t=map.get(step.entityKey);
          if(!t)throw new Error("Configura estadísticas después de invocar la criatura.");
          if(!ALLOWED_DEST.has(step.destStat as SummonStat)||
            !Number.isFinite(step.value)||step.value<0||step.value>1_000_000)
            throw new Error("Estadística fija de invocación fuera de los límites.");
          if(t.links.some(link=>link.destStat===step.destStat))
            throw new Error("No puedes fijar y vincular la misma estadística de una criatura.");
          t.links.push({mode:"FIXED",destStat:step.destStat as SummonStat,value:step.value});
          break;
        }
        case "SELECT_TARGET":
          if(!activeEntityKey||!["USER","OPPONENT"].includes(step.selector))
            throw new Error("El contacto requiere un invocador u oponente autorizado.");
          targets.set(step.output,step.selector);
          break;
        case "SELECT_STAT":
          if(!activeEntityKey||step.allowed.some(k=>!resolveStatusStat(k)))
            throw new Error("La selección incluye estadísticas no ejecutables en combate.");
          statChoices.set(step.output,{mode:step.mode,allowed:[...step.allowed],fixed:step.fixed});
          break;
        case "REQUIRE_CONTACT":
          if(!activeEntityKey||!targets.has(step.target.key))
            throw new Error("El contacto exige una selección de objetivo anterior.");
          contactAllowed.add(step.target.key);
          break;
        case "APPLY_STATUS":{
          if(!activeEntityKey||!contactAllowed.has(step.target.key))
            throw new Error("Conecta Comprobar contacto antes de aplicar estados a una criatura.");
          const t=map.get(activeEntityKey)!;
          const target=targets.get(step.target.key)!;
          const stat=typeof step.stat==="string"?step.stat:statChoices.get(step.stat.key);
          if(!stat||(typeof stat==="string"&&!resolveStatusStat(stat)))
            throw new Error("Estadística de contacto no soportada o sin selección.");
          if(typeof step.value!=="number"||!Number.isFinite(step.value)||
            step.operation==="MULTIPLIER"&&(step.value<0||step.value>3)||
            step.operation==="BONUS"&&Math.abs(step.value)>100000)
            throw new Error("El efecto de estado necesita un valor numérico fijo válido.");
          if(step.durationTurns>20)throw new Error("La duración máxima de estados es 20 turnos.");
          t.contactEffects.push({kind:"APPLY_STATUS",target,stat,
            operation:step.operation,value:step.value,durationTurns:step.durationTurns});
          break;
        }
        case "INVERT_STATUS":{
          if(!activeEntityKey||!contactAllowed.has(step.target.key))
            throw new Error("Conecta Comprobar contacto antes de invertir debilitamientos.");
          const t=map.get(activeEntityKey)!;
          t.contactEffects.push({kind:"INVERT_STATUS",
            target:targets.get(step.target.key)!,selection:step.selection,
            manaCost:step.manaCost,chargeAccumulator:step.chargeAccumulator});
          break;
        }
        case "SET_ENTITY_BEHAVIOR":{
          const t=map.get(step.entityKey);
          if(!t||behaviors.has(step.entityKey))throw new Error("Invocación: comportamiento duplicado o sin entidad.");
          if(!["USER","OPPONENT"].includes(step.target))
            throw new Error("La selección de aliados y objetivos libres necesita un resolutor de combate adicional.");
          t.behavior={mode:step.mode,allowedModes:[...step.allowedModes],target:step.target,trigger:step.trigger};
          behaviors.add(step.entityKey);
          break;
        }
        default:
          throw new Error("La habilidad combina invocaciones con otro micromódulo sin resolutor: "+step.kind);
      }
    }
  }
  if(map.size===0)throw new Error("La habilidad modular no contiene criaturas para invocar.");
  for(const t of map.values()){
    if(required.some(key=>!t.links.some(link=>link.destStat===key)))
      throw new Error("Cada criatura requiere ataque físico, agilidad e integridad vinculados.");
    if(!behaviors.has(t.entityKey))
      throw new Error("Cada criatura requiere un comportamiento configurado.");
  }
  const total=[...map.values()].reduce((sum,t)=>sum+t.manaCost,0);
  if(total!==skillManaCost)
    throw new Error("El maná de la habilidad debe coincidir con la suma de invocaciones ("+total+").");
  return [...map.values()];
}

export function resolveSummonStat(source:CombatFighter,link:SummonLink):number{
  if(link.mode==="FIXED")return link.value;
  const field=ALLOWED_SOURCE[link.sourceStat];
  if(!field)throw new Error("Estadística de origen desconocida.");
  const base=link.sourceStat==="MOVE_SPEED"?(source.speedValue??source.agility):source[field];
  if(typeof base!=="number"||!Number.isFinite(base)||base<0)
    throw new Error("La criatura necesita una estadística efectiva válida.");
  return Math.max(0,base*link.factor);
}
export function summonStat(summon:CombatSummon,owner:CombatFighter,dest:SummonStat):number{
  const link=summon.links.find(link=>link.destStat===dest);
  if(link)return resolveSummonStat(owner,link);
  switch(dest){
    case "PHYSICAL_DEFENSE":return owner.physicalDefense;
    case "MOVE_SPEED":return owner.speedValue??owner.agility;
    case "PRECISION":return owner.precision;
    case "DODGE":return owner.dodge;
    case "MAGIC_ATTACK":return owner.magicAttack;
    case "MAGIC_DEFENSE":return owner.magicDefense;
    case "CON":return owner.constitution;
    case "CRITICAL":return owner.critical;
    case "LUCK":return owner.luck;
    case "RACE":return owner.race;
    case "MASS_KG":return owner.massKg*0.08;
    case "STRENGTH":{
      const attackLink=summon.links.find(l=>l.destStat==="PHYSICAL_ATTACK");
      return owner.strength*(attackLink&&"factor" in attackLink?attackLink.factor:0.2);
    }
    default:return 0;
  }
}
