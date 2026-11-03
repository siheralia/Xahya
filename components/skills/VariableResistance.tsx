"use client";

import { useState } from "react";
import { calculateDerivedStats } from "@/lib/stats/derived";
import {
  DEFAULT_VARIABLE_RESISTANCE, RESISTANCE_FORMULA_OPTIONS, RESISTANCE_INPUT_OPTIONS,
  calculateVariableResistance, variableResistancePchCost, validateVariableResistance,
  type VariableResistance, type ResistanceFormula, type ResistanceInput,
} from "@/lib/skills/variable-resistance";

type StatDefinition={key:string;name:string;kind?:"basic"|"derived";active?:boolean};
type TemporaryEffect={target:string;mode:"percent"|"flat";value:number};
const inputClass="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white";
const labels:Record<string,string>={magicDefense:"Defensa Mágica",physicalDefense:"Defensa Física",constitution:"Constitución",spirit:"Espíritu"};
const standardStats:StatDefinition[]=Object.entries(labels).map(([key,name])=>({key,name}));
const coreKeys=["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"] as const;
type CoreKey=typeof coreKeys[number];
const baseKeys=coreKeys as readonly string[];
const formulaDescription:Record<ResistanceFormula,string>={
 PROGRESSIVE:"R = Base × [1 + (Máx − 1) × Entrada² / (Entrada² + Umbral²)]",
 LINEAR:"R = Base × mín(Máx, 1 + Coeficiente × Entrada)",
 DECREASING:"R = Base × máx(Mín, 1 − Coeficiente × Entrada)",
 THRESHOLD:"R = Base × (Entrada ≥ Umbral ? Máx : 1)",
 HITS:"R = Base × mín(Máx, 1 + Coeficiente × Impactos)",
};
export function VariableResistanceEditor({value,onChange,statistics=[]}:{
 value?:VariableResistance;onChange:(value:VariableResistance|undefined)=>void;
 statistics?:StatDefinition[];
}) {
 const [previewBase,setPreviewBase]=useState(100);
 const [previewInput,setPreviewInput]=useState(50);
 const enabled=Boolean(value);
 const c=value??DEFAULT_VARIABLE_RESISTANCE;
 const available=[...standardStats,...statistics.filter(s=>s.active!==false)].filter((s,i,a)=>a.findIndex(x=>x.key===s.key)===i);
 const update=(next:Partial<VariableResistance>)=>onChange({...c,...next});
 const validationError=validateVariableResistance(c);
 const result=validationError?null:calculateVariableResistance(c,previewBase,previewInput);
 return <div className="space-y-3 rounded-xl border border-cyan-700/50 bg-cyan-950/10 p-4">
  <label className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
   <input type="checkbox" checked={enabled} onChange={e=>onChange(e.target.checked?{...DEFAULT_VARIABLE_RESISTANCE}:undefined)}/>
   Resistencia variable (pasivas, barreras, armaduras y construcciones)
  </label>
  <p className="text-xs text-zinc-400">Configura una propiedad defensiva calculable; no modifica automáticamente el daño del motor de combate. La ficha usa las estadísticas efectivas del personaje.</p>
  {enabled&&<>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs text-zinc-400">Estadística de resistencia base
     <select className={inputClass} value={c.baseStat} onChange={e=>update({baseStat:e.target.value})}>
      {!available.some(s=>s.key===c.baseStat)&&<option value={c.baseStat}>{c.baseStat}</option>}
      {available.map(s=><option value={s.key} key={s.key}>{s.name}</option>)}
     </select>
    </label>
    <label className="text-xs text-zinc-400">Variable de entrada
     <select className={inputClass} value={c.input} disabled={c.formula==="HITS"} onChange={e=>update({input:e.target.value as ResistanceInput})}>
      {RESISTANCE_INPUT_OPTIONS.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}
     </select>
    </label>
    <label className="text-xs text-zinc-400">Fórmula de respuesta
     <select className={inputClass} value={c.formula} onChange={e=>{const formula=e.target.value as ResistanceFormula;update({formula,...(formula==="HITS"?{input:"HIT_COUNT" as const}:{})});}}>
      {RESISTANCE_FORMULA_OPTIONS.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}
     </select>
    </label>
    {c.formula!=="DECREASING"&&<label className="text-xs text-zinc-400">Multiplicador máximo (×1 a ×10)
     <input className={inputClass} type="number" min="1" max="10" step=".1" value={c.maxMultiplier} onChange={e=>update({maxMultiplier:Number(e.target.value)})}/>
    </label>}
    {c.formula==="DECREASING"&&<label className="text-xs text-zinc-400">Multiplicador mínimo (×0.2 a ×1)
     <input className={inputClass} type="number" min=".2" max="1" step=".1" value={c.minMultiplier} onChange={e=>update({minMultiplier:Number(e.target.value)})}/>
    </label>}
    {(c.formula==="PROGRESSIVE"||c.formula==="THRESHOLD")&&<label className="text-xs text-zinc-400">Umbral de referencia
     <input className={inputClass} type="number" min="1" max="100000" value={c.threshold} onChange={e=>update({threshold:Number(e.target.value)})}/>
    </label>}
    {(c.formula==="LINEAR"||c.formula==="DECREASING"||c.formula==="HITS")&&<label className="text-xs text-zinc-400">Coeficiente (k)
     <input className={inputClass} type="number" min="0" max="1" step=".01" value={c.coefficient} onChange={e=>update({coefficient:Number(e.target.value)})}/>
    </label>}
   </div>
   <p className="break-words rounded-lg bg-zinc-950/70 px-3 py-2 text-xs text-cyan-200">{formulaDescription[c.formula]}</p>
   {validationError&&<p role="alert" className="text-xs text-amber-300">{validationError}</p>}
   <p className="text-xs text-violet-300">Coste mecánico: {variableResistancePchCost(c)} PCH, incluido en el coste total de la habilidad.</p>
   <div className="grid gap-2 sm:grid-cols-2">
    <label className="text-xs text-zinc-400">Base de ejemplo (el personaje real se calcula automáticamente)
     <input className={inputClass} type="number" min="0" value={previewBase} onChange={e=>setPreviewBase(Math.max(0,Number(e.target.value)||0))}/>
    </label>
    <label className="text-xs text-zinc-400">Entrada de ejemplo
     <input className={inputClass} type="number" min="0" value={previewInput} onChange={e=>setPreviewInput(Math.max(0,Number(e.target.value)||0))}/>
    </label>
   </div>
   {result&&<p className="text-sm text-zinc-200">Ejemplo: ×{result.multiplier.toFixed(2)} → <strong>{result.resistance.toFixed(2)}</strong> resistencia</p>}
  </>}
 </div>;
}
function localEffectiveStat(key:string,effectiveStats:Record<string,number>,derivedStats:Record<string,number>,effects:TemporaryEffect[]):number|null {
 const value=baseKeys.includes(key)?effectiveStats[key]:derivedStats[key]??effectiveStats[key];
 if(typeof value!=="number"||!Number.isFinite(value))return null;
 const apply=(stat:string,base:number)=>{
   const matching=effects.filter(e=>e.target===stat);
   const percent=matching.filter(e=>e.mode==="percent").reduce((sum,e)=>sum+e.value,0);
   const flat=matching.filter(e=>e.mode==="flat").reduce((sum,e)=>sum+e.value,0);
   return base*(1+percent/100)+flat;
 };
 let current=value;
 // For native derived stats, incorporate local-only changes to basic stats
 // as the change in the canonical formula, preserving server-side equipment,
 // race perks and persisted temporary bonuses already included in derivedStats.
 if(!baseKeys.includes(key)&&coreKeys.every(k=>Number.isFinite(effectiveStats[k]))){
  const original=Object.fromEntries(coreKeys.map(k=>[k,effectiveStats[k]])) as Record<CoreKey,number>;
  const modified=Object.fromEntries(coreKeys.map(k=>[k,apply(k,effectiveStats[k])])) as Record<CoreKey,number>;
  const originalDerived=calculateDerivedStats(original);
  const modifiedDerived=calculateDerivedStats(modified);
  if(key in originalDerived && key in modifiedDerived){
   current+=modifiedDerived[key as keyof typeof modifiedDerived]-originalDerived[key as keyof typeof originalDerived];
  }
 }
 return Math.max(0,apply(key,current));
}
export function VariableResistanceCalculator({config,effectiveStats,derivedStats,temporaryEffects=[],hpPercent}:{
 config:VariableResistance;effectiveStats:Record<string,number>;derivedStats:Record<string,number>;
 temporaryEffects?:TemporaryEffect[];hpPercent?:number;
}){
 const [value,setValue]=useState(50);
 const base=localEffectiveStat(config.baseStat,effectiveStats,derivedStats,temporaryEffects);
 const inputValue=config.input==="HP_PERCENT"&&Number.isFinite(hpPercent)?Math.max(0,Math.min(100,hpPercent!)):value;
 const result=base===null||validateVariableResistance(config)?null:calculateVariableResistance(config,base,inputValue);
 const inputLabel=RESISTANCE_INPUT_OPTIONS.find(o=>o.value===config.input)?.label??config.input;
 return <div className="mt-4 space-y-3 rounded-xl border border-cyan-600/40 bg-cyan-950/15 p-3 text-sm">
  <p className="font-semibold text-cyan-200">Calculadora · Resistencia variable</p>
  <p className="text-xs text-zinc-400">{RESISTANCE_FORMULA_OPTIONS.find(o=>o.value===config.formula)?.label} · {labels[config.baseStat]??config.baseStat}</p>
  <div className="grid gap-3 sm:grid-cols-2">
   <div className="rounded-lg border border-zinc-700 p-3">
    <span className="block text-xs text-zinc-400">Base efectiva actual</span>
    <strong className="text-lg">{base===null?"No disponible":base.toLocaleString("es-MX",{maximumFractionDigits:2})}</strong>
   </div>
   <label className="text-xs text-zinc-400">{inputLabel} {config.input==="ATTACK_SPEED"?"(valor del ataque, sin unidades)":""}
    <input className={inputClass} type="number" min="0" max={config.input==="HP_PERCENT"?100:undefined} step={config.input==="HIT_COUNT"?1:"any"} value={inputValue} readOnly={config.input==="HP_PERCENT"&&Number.isFinite(hpPercent)} onChange={e=>setValue(Math.max(0,Math.min(config.input==="HP_PERCENT"?100:100000,Number(e.target.value)||0)))}/>
   </label>
  </div>
  {config.input==="HP_PERCENT"&&Number.isFinite(hpPercent)&&<p className="text-xs text-cyan-300">Vida actual de la ficha, actualizada automáticamente.</p>}
  {result?<div className="grid grid-cols-2 gap-2">
   <div className="rounded-lg bg-zinc-950/70 p-3"><span className="block text-xs text-zinc-400">Multiplicador</span><strong className="text-lg">×{result.multiplier.toFixed(2)}</strong></div>
   <div className="rounded-lg bg-zinc-950/70 p-3"><span className="block text-xs text-zinc-400">Resistencia efectiva</span><strong className="text-lg">{result.resistance.toLocaleString("es-MX",{maximumFractionDigits:2})}</strong></div>
  </div>:<p className="text-amber-300">No existe la estadística base en este personaje.</p>}
  <p className="text-xs text-zinc-500">Simulación de resistencia, no aplica daño ni resuelve impactos automáticamente. Los efectos guardados y el equipamiento se leen de la ficha; los ajustes locales de Estado de rol se simulan aquí.</p>
 </div>;
}
