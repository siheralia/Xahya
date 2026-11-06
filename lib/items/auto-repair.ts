/**
 * Approved catalog-owned equipment passive. The same typed micro-graph
 * is used by manual skills, but an item cannot use a generic graph as an
 * arbitrary event handler. Runtime is only TURN_START in an encounter.
 */
import {validateEffectContainers,executeMicroEvent,emptyMicroState,
  type EffectContainer,type MicroIntent} from "../effects/micro-modules.ts";
import type {RepairableItem} from "../effects/repair-durability.ts";

export const AUTO_REPAIR_ITEM_EFFECT="auto_repair_durability" as const;
export type AutoRepairItemEffect={
  type:typeof AUTO_REPAIR_ITEM_EFFECT;manaCost:number;intervalTurns:number;
  module:EffectContainer;
};
export type AutoRepairEvaluation={restored:number;after:number;intents:
  Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>[]};

const allowed=new Set(["READ_ITEM","READ_STAT","CALCULATE","REPAIR_DURABILITY"]);
const MAX_MANA=1000;
const MAX_INTERVAL=50;
const num=(v:unknown,min:number,max:number):v is number=>
  Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;

/** Stats/event sources are read server-side. No charge store or event-shaped
 * input exists in an equipment tick, so unsupported sources fail closed. */
function forbiddenInput(value:unknown):boolean{
 if(!value||typeof value!=="object")return false;
 if(Array.isArray(value))return value.some(forbiddenInput);
 const obj=value as Record<string,unknown>;
 if(obj.source&&obj.source!=="OUTPUT"&&obj.source!=="STAT")return true;
 return Object.values(obj).some(forbiddenInput);
}
/** Staff validation and combat snapshot ingestion share a single schema.
 * No partially invalid item can be interpreted as a different active effect. */
export function compileWeaponAutoRepair(
 rawEffects:unknown,itemType:string
):AutoRepairItemEffect|null{
 if(!Array.isArray(rawEffects))return null;
 const matched=rawEffects.filter(x=>x&&typeof x==="object"&&!Array.isArray(x)&&
    (x as Record<string,unknown>).type===AUTO_REPAIR_ITEM_EFFECT);
 if(matched.length===0)return null;
 if(matched.length!==1||itemType!=="WEAPON")
  throw new Error("La autorreparación solo admite un efecto por arma.");
 const raw=matched[0] as Record<string,unknown>;
 if(Object.keys(raw).some(key=>!["type","manaCost","intervalTurns","module"].includes(key)))
  throw new Error("Campos de autorreparación desconocidos.");
 if(!num(raw.manaCost,1,MAX_MANA))
  throw new Error("La autorreparación necesita un coste de maná positivo (1–1000).");
 if(!num(raw.intervalTurns,1,MAX_INTERVAL))
  throw new Error("El intervalo de autorreparación debe ser de 1 a 50 turnos.");
 const module=raw.module as EffectContainer;
 const error=validateEffectContainers([module]);
 if(error)throw new Error(error);
 if(module.trigger!=="TURN_START"||module.impactKind!==undefined)
  throw new Error("Una autorreparación debe activarse al inicio del turno.");
 if(module.steps.length>12||module.steps.some(step=>!allowed.has(step.kind)||
    (step.kind==="READ_ITEM"&&step.selector!=="SOURCE_ITEM")))
  throw new Error("La autorreparación solo puede leer su propio objeto, estadísticas, calcular y restaurar.");
 if(!module.steps.some(step=>step.kind==="REPAIR_DURABILITY")||
    !module.steps.some(step=>step.kind==="READ_ITEM"&&step.selector==="SOURCE_ITEM"))
  throw new Error("Faltan las conexiones Leer objeto → Restaurar durabilidad.");
 if(forbiddenInput(module.requirements)||
    module.steps.some(step=>forbiddenInput(step.when)||
      (step.kind==="CALCULATE"&&forbiddenInput(step.expression))||
      (step.kind==="REPAIR_DURABILITY"&&forbiddenInput(step.amount))))
  throw new Error("El objeto solo admite fuentes numéricas de estadísticas y salidas previas.");
 return {type:AUTO_REPAIR_ITEM_EFFECT,
  manaCost:raw.manaCost as number,
  intervalTurns:raw.intervalTurns as number,
  module:structuredClone(module)};
}
/** Management form creates one valid, fully connected editable micro-graph. */
export function defaultWeaponAutoRepair():AutoRepairItemEffect{
 return {
  type:AUTO_REPAIR_ITEM_EFFECT,manaCost:5,intervalTurns:1,
  module:{id:"AutoRepairItem",name:"Autorreparación",type:"ItemPassive",
   description:"Recupera durabilidad propia al comienzo de turnos de combate.",
   trigger:"TURN_START",steps:[
    {kind:"READ_ITEM",selector:"SOURCE_ITEM",output:"sourceItem"},
    {kind:"CALCULATE",expression:5,output:"repairAmount"},
    {kind:"REPAIR_DURABILITY",target:{source:"OUTPUT",key:"sourceItem"},
     amount:{source:"OUTPUT",key:"repairAmount"}},
   ]},
 };
}
/** Pure projection. Charging mana and persisting the resulting durability is
 * the caller's job and must be atomic with encounter progression.
 */
export function evaluateWeaponAutoRepair(
 rule:AutoRepairItemEffect,item:RepairableItem,stats:Record<string,number>,
 actors?:Record<string,Record<string,number>>
):AutoRepairEvaluation{
 const valid=compileWeaponAutoRepair([rule],"WEAPON");
 if(!valid)throw new Error("Configuración de autorreparación ausente.");
 const result=executeMicroEvent(emptyMicroState(),[valid.module],{
  eventId:"WeaponRepair",ownerId:item.characterItemId,trigger:"TURN_START",
  stats,actors,itemTargets:[item],
  itemSelectors:{SOURCE_ITEM:item.characterItemId}
 });
 if(result.intents.some(intent=>intent.kind!=="REPAIR_DURABILITY"))
  throw new Error("Un objeto generó efectos no autorizados.");
 const repairs=result.intents as Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>[];
 if(repairs.some(repair=>repair.characterItemId!==item.characterItemId))
  throw new Error("El objeto intentó reparar otro ejemplar.");
 return {restored:repairs.reduce((sum,repair)=>sum+repair.applied,0),
  after:repairs.at(-1)?.after??item.durability,
  intents:repairs};
}
/** Round 1 has no automatic start event: first possible activation is round 2. */
export function shouldAutoRepairAtRound(round:number,intervalTurns:number):boolean{
 return Number.isSafeInteger(round)&&round>=2&&
  num(intervalTurns,1,MAX_INTERVAL)&& (round-2)%intervalTurns===0;
}
