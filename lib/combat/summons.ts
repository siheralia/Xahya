/** Combat-approved subset of general entity micromodules.
 * A summon is NEVER inferred from an effect name or from narrative text.
 * Definitions outside this strict set remain non-executable in combat.
 */
import {validateEffectContainers,type EffectContainer,type EntityBehaviorMode,
  type EntityTargetSlot,type MicroStep} from "../effects/micro-modules.ts";
import type {CombatFighter,Point,Side} from "./turn-engine.ts";

export type SummonStat = "PHYSICAL_ATTACK"|"PHYSICAL_DEFENSE"|"AGI"|"INTEGRITY"|
  "MOVE_SPEED"|"PRECISION"|"DODGE"|"STRENGTH";
export type SummonLink = {sourceStat:string;destStat:SummonStat;factor:number};
export type SummonBehavior = {mode:EntityBehaviorMode;allowedModes:EntityBehaviorMode[];
  target:EntityTargetSlot;trigger:"CONTACT"|"HP_DAMAGE"|"COMMAND"};
export type SummonTemplate = {
  entityKey:string;label:string;manaCost:number;maintenanceMana:number;
  durationTurns:number;controlRangeMeters:number;hitLimit:number;
  links:SummonLink[];behavior:SummonBehavior;
};
export type CombatSummon = {
  id:string;owner:Side;sourceSkillId:number;entityKey:string;label:string;
  fieldPosition:Point;createdRound:number;expiresAtRound:number;
  controlRangeMeters:number;maintenanceMana:number;
  integrity:number;hitCount:number;hitLimit:number;
  links:SummonLink[];behavior:SummonBehavior;
};
const ALLOWED_SOURCE:Record<string,keyof CombatFighter>={
  PHYSICAL_ATTACK:"physicalAttack",PHYSICAL_DEFENSE:"physicalDefense",
  AGI:"agility",MOVE_SPEED:"speedValue",PRECISION:"precision",
  DODGE:"dodge",STR:"strength",STRENGTH:"strength",
};
const ALLOWED_DEST=new Set<SummonStat>([
  "PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI","INTEGRITY",
  "MOVE_SPEED","PRECISION","DODGE","STRENGTH",
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
            links:[],behavior:{mode:"FOLLOW",allowedModes:["FOLLOW"],target:"USER",trigger:"COMMAND"}
          });
          break;
        case "LINK_ENTITY_STAT":{
          const t=map.get(step.entityKey);
          if(!t)throw new Error("Vincula las estadísticas después de invocar su entidad.");
          if(!Object.hasOwn(ALLOWED_SOURCE,step.sourceStat)||!ALLOWED_DEST.has(step.destStat as SummonStat)||
            !acceptableFactor(step.factor))
            throw new Error("Invocación: estadísticas/factor de criatura no soportados por el motor de combate.");
          if(t.links.some(link=>link.destStat===step.destStat))
            throw new Error("Invocación: cada estadística de criatura admite un único vínculo.");
          if(step.destStat==="INTEGRITY"&&step.sourceStat!=="PHYSICAL_DEFENSE")
            throw new Error("La integridad de una criatura debe vincularse a la defensa física.");
          t.links.push({sourceStat:step.sourceStat,destStat:step.destStat as SummonStat,factor:step.factor});
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
    case "STRENGTH":return owner.strength*(summon.links.find(l=>l.destStat==="PHYSICAL_ATTACK")?.factor??0.2);
    default:return 0;
  }
}
