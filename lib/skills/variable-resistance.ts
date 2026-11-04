/**
 * Reusable declarative resistance response. All inputs are Xahya stat values,
 * never physical m/s. This module calculates a preview, not combat damage.
 */
export type ResistanceInput = "ATTACK_SPEED" | "INCOMING_DAMAGE" | "HIT_COUNT" | "HP_PERCENT";
/** USER: character owning the skill/construction; OPPONENT: rival in the event. */
export type ResistanceActor = "USER" | "OPPONENT";
export type ResistanceFormula = "PROGRESSIVE" | "LINEAR" | "DECREASING" | "THRESHOLD" | "HITS";
export type VariableResistance = {
  baseStat: string;
  /** Owner of the base stat; omitted by historic skills = USER. */
  baseOwner?: ResistanceActor;
  input: ResistanceInput;
  /** Owner of the measured variable; historical omissions keep their combat meaning. */
  inputOwner?: ResistanceActor;
  formula: ResistanceFormula;
  maxMultiplier: number;
  minMultiplier: number;
  threshold: number;
  coefficient: number;
};
export const DEFAULT_VARIABLE_RESISTANCE: VariableResistance = {
  baseStat: "magicDefense",
  baseOwner: "USER",
  input: "ATTACK_SPEED",
  inputOwner: "OPPONENT",
  formula: "PROGRESSIVE",
  maxMultiplier: 3,
  minMultiplier: 0.2,
  threshold: 50,
  coefficient: 0.02,
};
export const RESISTANCE_INPUT_OPTIONS: {value:ResistanceInput;label:string}[] = [
  {value:"ATTACK_SPEED",label:"Velocidad efectiva del ataque"},
  {value:"INCOMING_DAMAGE",label:"Daño entrante"},
  {value:"HIT_COUNT",label:"Impactos acumulados"},
  {value:"HP_PERCENT",label:"Vida restante (%)"},
];
export const RESISTANCE_FORMULA_OPTIONS: {value:ResistanceFormula;label:string}[] = [
  {value:"PROGRESSIVE",label:"Endurecimiento progresivo"},
  {value:"LINEAR",label:"Crecimiento lineal"},
  {value:"DECREASING",label:"Resistencia decreciente"},
  {value:"THRESHOLD",label:"Activación por umbral"},
  {value:"HITS",label:"Acumulación por impactos"},
];
export const resistanceBaseOwner=(config:VariableResistance):ResistanceActor=>config.baseOwner??"USER";
export const resistanceInputOwner=(config:VariableResistance):ResistanceActor=>
  config.inputOwner??(config.input==="HIT_COUNT"||config.input==="HP_PERCENT"?"USER":"OPPONENT");
/** Canonicalize old persisted records without changing their math or billing. */
export const withResistanceOwners=(config:VariableResistance):VariableResistance=>({
  ...config,baseOwner:resistanceBaseOwner(config),inputOwner:resistanceInputOwner(config),
});
const validOwner=(value:unknown)=>value==="USER"||value==="OPPONENT";
const bounded=(value:unknown,min:number,max:number)=>typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max;
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
export function validateVariableResistance(value:unknown):string|null {
  if(!isRecord(value))return "Configuración de resistencia variable inválida.";
  const c=value;
  if(typeof c.baseStat!=="string"||!(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(c.baseStat)))
    return "Estadística base de resistencia inválida.";
  if(c.baseOwner!==undefined&&!validOwner(c.baseOwner))return "Origen de la estadística base inválido.";
  if(c.inputOwner!==undefined&&!validOwner(c.inputOwner))return "Origen de la variable inválido.";
  if(!RESISTANCE_INPUT_OPTIONS.some(x=>x.value===c.input))return "Variable de resistencia inválida.";
  if(!RESISTANCE_FORMULA_OPTIONS.some(x=>x.value===c.formula))return "Fórmula de resistencia inválida.";
  if(!bounded(c.maxMultiplier,1,10)||!bounded(c.minMultiplier,0.2,1)
     ||!bounded(c.threshold,1,100000)||!bounded(c.coefficient,0,1))
    return "Parámetros de resistencia inválidos.";
  if(c.formula==="HITS"&&c.input!=="HIT_COUNT")return "La acumulación necesita el número de impactos.";
  return null;
}
/** Returns multiplier and resistance; invalid data is rejected, not silently clamped. */
export function calculateVariableResistance(config:VariableResistance,base:number,rawInput:number) {
  const error=validateVariableResistance(config);
  if(error)throw new Error(error);
  if(!Number.isFinite(base)||base<0||!Number.isFinite(rawInput)||rawInput<0)
    throw new Error("La resistencia base y la variable deben ser finitas y no negativas.");
  const x=config.input==="HP_PERCENT"?Math.min(100,rawInput):rawInput;
  let multiplier=1;
  switch(config.formula){
    case "PROGRESSIVE":
      multiplier=1+(config.maxMultiplier-1)*(x*x/(x*x+config.threshold*config.threshold));break;
    case "LINEAR":
    case "HITS":
      multiplier=Math.min(config.maxMultiplier,1+config.coefficient*x);break;
    case "DECREASING":
      multiplier=Math.max(config.minMultiplier,1-config.coefficient*x);break;
    case "THRESHOLD":
      multiplier=x>=config.threshold?config.maxMultiplier:1;break;
  }
  return {multiplier,resistance:base*multiplier,input:x,base};
}
/** PCH premium grows with the cap and how easily it is reached. */
export function variableResistancePchCost(config:VariableResistance):number {
  if(validateVariableResistance(config))return 0;
  if(config.formula==="DECREASING")return 4;
  const power=Math.ceil((config.maxMultiplier-1)*7);
  const accessibility=config.formula==="LINEAR"||config.formula==="HITS"
    ?Math.ceil(config.coefficient*60)
    :Math.ceil(12/(1+config.threshold/25));
  return 8+power+accessibility;
}
