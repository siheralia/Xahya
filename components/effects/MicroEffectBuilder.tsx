"use client";

import type {EffectContainer,MicroStep,MicroCondition,NumericExpr,MicroEvent} from "@/lib/effects/micro-modules";
import {REPAIR_TARGET_SELECTORS} from "@/lib/effects/repair-durability";
import {useState} from "react";
import {changeNumericReferenceSource,invalidPreviousOutput,selectablePreviousOutputs} from "@/lib/effects/micro-reference-editor";
import {MicroEffectFlowEditor} from "./MicroEffectFlowEditor";
import {DEFAULT_VARIABLE_RESISTANCE} from "@/lib/skills/variable-resistance";
import {MICRO_STEP_LABELS,MICRO_SOURCE_LABELS,MICRO_OPERATOR_LABELS,
  MICRO_TRIGGER_LABELS,MICRO_COMPARISON_LABELS,MICRO_INPUT_LABELS,
  MICRO_FORMULA_LABELS,MICRO_CONFIG_LABELS,MICRO_STAT_SUGGESTIONS,
  MICRO_REFERENCE_SUGGESTIONS,friendlyMicroKey} from "@/lib/effects/micro-labels";

const field="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100";
const key="^[A-Za-z][A-Za-z0-9_.:-]{0,63}$";
const sources=["EVENT","STAT","CHARGES","STORED_TOTAL","OUTPUT"] as const;
const ops=["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX","PERCENT"] as const;
const events:MicroEvent[]=["DAMAGE_RESOLVED","TURN_START","IMPACT","PASSIVE","ACTIVATE"];
const stepKinds:MicroStep["kind"][]=["READ_STAT","READ_STORED","READ_ITEM","CALCULATE",
  "STORE","CONSUME","REPAIR_DURABILITY","HEAL","DAMAGE","MODIFIER","BONUS",
  "SELECT_TARGET","SELECT_STAT","READ_HP_DAMAGE","REQUIRE_CONTACT","SUMMON_ENTITY",
  "LINK_ENTITY_STAT","SET_ENTITY_STAT","SET_ENTITY_BEHAVIOR","APPLY_STATUS","READ_STATUSES","INVERT_STATUS",
  "CAPABILITY","VARIABLE_RESISTANCE"];
const destinationStats:readonly string[]=["STR","AGI","CON","INT","WIS","CHA","SPI",
  "HP","MAX_HP","MANA","RESISTANCE","MAGIC_DEF","PHYS_DEF","MAGIC_ATTACK","PHYSICAL_ATTACK"];
const defaultCondition=():MicroCondition=>({left:{source:"CHARGES",key:"DIVINE_GRACE"},compare:"GTE",right:1});
const ref=():NumericExpr=>({source:"STAT",key:"MAX_HP"});
const op=():NumericExpr=>({operator:"PERCENT",args:[ref(),10]});
const defaultStep=(kind:MicroStep["kind"]):MicroStep=>{
  switch(kind){
    case "STORE":return {kind,accumulator:"ENERGY",capacity:5,value:{source:"EVENT",key:"MITIGATED_DAMAGE"}};
    case "CONSUME":return {kind,accumulator:"ENERGY",output:"energy",charges:"ALL"};
    case "READ_STAT":return {kind,actor:"USER",stat:"magicDefense",output:"resistanceBase"};
    case "READ_STORED":return {kind,accumulator:"ENERGY",metric:"TOTAL",output:"storedTotal"};
    case "CALCULATE":return {kind,output:"calculated",expression:1};
    case "READ_ITEM":return {kind,selector:"SELECTED_ITEM",output:"selectedItem"};
    case "REPAIR_DURABILITY":return {kind,target:{source:"OUTPUT",key:"selectedItem"},amount:10};
    case "HEAL":return {kind,amount:op()};
    case "DAMAGE":return {kind,amount:10,channel:"MAGICAL"};
    case "MODIFIER":return {kind,stat:"RESISTANCE",multiplier:1.3};
    case "BONUS":return {kind,stat:"STR",amount:10};
    case "SELECT_TARGET":return {kind,selector:"OPPONENT",output:"chosenTarget"};
    case "SELECT_STAT":return {kind,mode:"FIXED",allowed:["STR","AGI","DODGE"],fixed:"STR",output:"chosenStat"};
    case "READ_HP_DAMAGE":return {kind,output:"hpDamage"};
    case "REQUIRE_CONTACT":return {kind,target:{source:"OUTPUT",key:"chosenTarget"}};
    case "SUMMON_ENTITY":return {kind,entityKey:"FAMILIAR",label:"Familiar",manaCost:30,
      maintenanceMana:20,durationTurns:2,controlRangeMeters:15,hitLimit:3};
    case "LINK_ENTITY_STAT":return {kind,entityKey:"FAMILIAR",sourceStat:"PHYSICAL_ATTACK",
      destStat:"PHYSICAL_ATTACK",factor:0.2};
    case "SET_ENTITY_STAT":return {kind,entityKey:"FAMILIAR",destStat:"PHYSICAL_ATTACK",value:100};
    case "SET_ENTITY_BEHAVIOR":return {kind,entityKey:"FAMILIAR",mode:"FOLLOW",
      allowedModes:["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"],target:"USER",trigger:"CONTACT"};
    case "APPLY_STATUS":return {kind,target:{source:"OUTPUT",key:"chosenTarget"},stat:"STR",
      operation:"MULTIPLIER",value:0.5,durationTurns:2};
    case "READ_STATUSES":return {kind,target:{source:"OUTPUT",key:"chosenTarget"},filter:"DEBUFF",output:"statusCount"};
    case "INVERT_STATUS":return {kind,target:{source:"OUTPUT",key:"chosenTarget"},
      selection:"LATEST_DEBUFF",manaCost:10,chargeAccumulator:"LUNAR_CHARGES"};
    case "CAPABILITY":return {kind,code:"NARRATIVE:OTHER",description:""};
    case "VARIABLE_RESISTANCE":return {kind,config:{...DEFAULT_VARIABLE_RESISTANCE}};
  }
};
export function freshMicroEffect():EffectContainer{
  return {id:"MODULE_"+crypto.randomUUID().replaceAll("-",""),name:"Nuevo efecto",
    type:"COMPOSED",description:"",trigger:"PASSIVE",steps:[defaultStep("MODIFIER")]};
}
function NumericEditor({value,onChange,depth=0,outputOptions=[]}:{value:NumericExpr;onChange:(value:NumericExpr)=>void;depth?:number;outputOptions?:string[]}){
  // Historical and partially edited drafts can contain incomplete values.
  // Render an editable recovery instead of throwing during React render.
  if(value===null||value===undefined||(typeof value!=="number"&&(
    typeof value!=="object"||
    (!("source" in value)&&!("operator" in value))||
    ("operator" in value&&!Array.isArray(value.args))
  ))){
    return <div className="rounded-lg border border-amber-700 bg-amber-950/20 p-3 text-sm">
      <p className="text-amber-200">Este valor tiene una referencia incompleta. Puedes corregirlo sin perder el resto de la habilidad.</p>
      <button type="button" className="mt-2 rounded border border-amber-600 px-3 py-1" onClick={()=>onChange(0)}>Usar número fijo</button>
    </div>;
  }
  const kind=typeof value==="number"?"NUMBER":"source" in value?"REFERENCE":"OPERATION";
  const suggested=typeof value!=="number"&&"source" in value?(MICRO_REFERENCE_SUGGESTIONS[value.source]??[]):[];
  const validOutputs=selectablePreviousOutputs(outputOptions);
  const invalidOutput=invalidPreviousOutput(value,validOutputs);
  return <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
    <select aria-label="Tipo de valor" className={field} value={kind} onChange={e=>{
      const v=e.target.value;
      onChange(v==="NUMBER"?1:v==="REFERENCE"?{source:"STAT",key:"MAX_HP"}:{operator:"ADD",args:[1,1]});
    }}>
      <option value="NUMBER">Número fijo</option><option value="REFERENCE">Referencia</option><option value="OPERATION">Operación</option>
    </select>
    {typeof value==="number"?<input aria-label="Número" type="number" step="any" className={field} value={value} onChange={e=>onChange(Number(e.target.value))}/>:
      "source" in value?<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select aria-label="Origen de referencia" className={field} value={value.source}
          onChange={e=>{
            const next=changeNumericReferenceSource(value,e.target.value as typeof value.source,validOutputs);
            if(next!==null)onChange(next);
          }}>
          {sources.map(source=><option key={source} value={source}
            disabled={source==="OUTPUT"&&validOutputs.length===0&&value.source!=="OUTPUT"}>
            {MICRO_SOURCE_LABELS[source]}
          </option>)}
        </select>
        {value.source==="OUTPUT"?
          validOutputs.length>0?
            <select aria-label="Salida de micromódulo anterior" className={field}
              value={validOutputs.includes(value.key)?value.key:""}
              onChange={e=>onChange({...value,key:e.target.value})}>
              <option value="" disabled>Selecciona salida anterior</option>
              {validOutputs.map(key=><option key={key} value={key}>{friendlyMicroKey(key)}</option>)}
            </select>:
            <p role="alert" className="rounded-lg border border-amber-700 p-2 text-xs text-amber-200">
              No existe una salida de un micromódulo anterior. Añade «Leer estadística» o «Valor/cálculo» y colócalo antes de este daño.
            </p>:
          suggested.length>0?<div className="space-y-1 sm:col-span-2">
            <select aria-label="Dato disponible" className={field}
              value={suggested.includes(value.key)?value.key:"__CUSTOM__"}
              onChange={e=>onChange({...value,key:e.target.value==="__CUSTOM__"?"":e.target.value})}>
              {suggested.map(k=><option key={k} value={k}>{friendlyMicroKey(k)}</option>)}
              <option value="__CUSTOM__">Otro dato (avanzado)</option>
            </select>
            {!suggested.includes(value.key)&&<input aria-label="Identificador de dato personalizado" pattern={key} className={field}
              value={value.key??""} onChange={e=>onChange({...value,key:e.target.value})} placeholder="Identificador interno"/>}
          </div>:
          <input aria-label="Identificador del dato" pattern={key} className={field} value={value.key??""}
            onChange={e=>onChange({...value,key:e.target.value})} placeholder="Nombre interno del dato"/>}
        {invalidOutput&&<p role="alert" className="text-xs text-amber-200 sm:col-span-2">
          La salida seleccionada no existe antes de este módulo. Selecciona una salida válida o cambia el origen.
        </p>}
        {value.source!=="OUTPUT"&&validOutputs.length===0&&
          <p className="text-xs text-zinc-400 sm:col-span-2">
            Para utilizar el resultado de otro módulo, coloca primero uno que genere una salida.
          </p>}
      </div>:
      <div className="space-y-2">
        <select aria-label="Operación matemática" className={field} value={value.operator} onChange={e=>{
          const next=e.target.value as typeof value.operator;
          const binary=["DIVIDE","SUBTRACT","PERCENT"].includes(next);
          onChange({operator:next,args:binary?value.args.slice(0,2).concat(Array(Math.max(0,2-value.args.length)).fill(1)):value.args});
        }}>{ops.map(n=><option key={n} value={n}>{MICRO_OPERATOR_LABELS[n]}</option>)}</select>
        {depth>=4?<p role="note" className="text-xs text-amber-300">Expresión demasiado profunda para esta vista; reduce los niveles.</p>:
          value.args.map((arg,i)=><div key={i} className="space-y-1">
            <span className="text-xs text-zinc-400">Argumento {i+1}</span>
            <NumericEditor value={arg} depth={depth+1} outputOptions={validOutputs} onChange={next=>onChange({...value,args:value.args.map((x,j)=>j===i?next:x)})}/>
            {!["DIVIDE","SUBTRACT","PERCENT"].includes(value.operator)&&value.args.length>1&&
              <button type="button" className="text-xs text-rose-300" onClick={()=>onChange({...value,args:value.args.filter((_,j)=>j!==i)})}>Quitar argumento</button>}
          </div>)}
        {!["DIVIDE","SUBTRACT","PERCENT"].includes(value.operator)&&value.args.length<8&&<button type="button" className="rounded border border-zinc-600 px-2 py-1 text-xs" onClick={()=>onChange({...value,args:[...value.args,1]})}>+ Argumento</button>}
      </div>}
  </div>;
}
function ConditionsEditor({value,onChange,title}:{value:MicroCondition[];onChange:(next:MicroCondition[])=>void;title:string}){
  return <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/40 p-3">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{title}</h4>
      <button type="button" disabled={value.length>=12} onClick={()=>onChange([...value,defaultCondition()])} className="rounded border border-zinc-600 px-2 py-1 text-xs disabled:opacity-40">+ Condición</button>
    </div>
    <p className="text-xs text-zinc-500">Se deben cumplir todas las condiciones. Vacío = siempre.</p>
    {value.map((item,i)=><div key={i} className="space-y-2 rounded-lg border border-zinc-700 p-2">
      <div className="flex items-center justify-between"><span className="text-xs text-zinc-400">Condición {i+1}</span><button type="button" className="text-xs text-rose-300" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>Quitar</button></div>
      <span className="text-xs">Valor izquierdo</span>
      <NumericEditor value={item.left} onChange={left=>onChange(value.map((x,j)=>j===i?{...x,left}:x))}/>
      <select aria-label="Comparador" value={item.compare} className={field} onChange={e=>onChange(value.map((x,j)=>j===i?{...x,compare:e.target.value as MicroCondition["compare"]}:x))}>
        {["EQ","NE","GT","GTE","LT","LTE"].map(c=><option key={c} value={c}>{MICRO_COMPARISON_LABELS[c]}</option>)}
      </select>
      <span className="text-xs">Valor derecho</span>
      <NumericEditor value={item.right} onChange={right=>onChange(value.map((x,j)=>j===i?{...x,right}:x))}/>
    </div>)}
  </section>;
}
function StepEditor({step,onChange,onDelete,index,availableOutputs,availableItemOutputs,availableTargetOutputs,availableStatOutputs}:{step:MicroStep;onChange:(s:MicroStep)=>void;onDelete:()=>void;index:number;availableOutputs:string[];availableItemOutputs:string[];availableTargetOutputs:string[];availableStatOutputs:string[]}){
  const change=(patch:Partial<MicroStep>)=>onChange({...step,...patch} as MicroStep);
  return <section className="space-y-3 rounded-xl border border-cyan-900/60 bg-zinc-900/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Micromódulo {index+1}</h4>
      <button type="button" onClick={onDelete} className="text-xs text-rose-300">Eliminar</button></div>
    <label className="block text-xs">Operación<select className={"mt-1 "+field} value={step.kind} onChange={e=>onChange({...defaultStep(e.target.value as MicroStep["kind"]),when:step.when})}>
      {stepKinds.map(kind=><option key={kind} value={kind}>{MICRO_STEP_LABELS[kind]}</option>)}
    </select></label>
    {step.kind==="READ_STAT"&&<div className="grid gap-2 sm:grid-cols-3">
      <label className="text-xs">¿De quién?
        <select className={"mt-1 "+field} value={step.actor}
          onChange={e=>change({actor:e.target.value as "USER"|"OPPONENT"})}>
          <option value="USER">Usuario / propietario</option>
          <option value="OPPONENT">Oponente</option>
        </select>
      </label>
      <label className="text-xs">Estadística o dato de combate
        <select aria-label="Estadística" className={"mt-1 "+field}
          value={(MICRO_STAT_SUGGESTIONS as readonly string[]).includes(step.stat)?step.stat:"__CUSTOM__"}
          onChange={e=>change({stat:e.target.value==="__CUSTOM__"?"":e.target.value})}>
          {MICRO_STAT_SUGGESTIONS.map(code=><option key={code} value={code}>{friendlyMicroKey(code)}</option>)}
          <option value="__CUSTOM__">Otra estadística (avanzado)</option>
        </select>
        {!(MICRO_STAT_SUGGESTIONS as readonly string[]).includes(step.stat)&&
          <input aria-label="Clave de estadística personalizada" className={"mt-1 "+field}
          value={step.stat} onChange={e=>change({stat:e.target.value})} placeholder="Clave interna"/>}
      </label>
      <label className="text-xs">Nombre de salida
        <input className={"mt-1 "+field} value={step.output}
          onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-zinc-400 sm:col-span-3">Lee un valor real del combate sin modificarlo. El oponente se resuelve desde el servidor, no desde el navegador.</p>
    </div>}
    {step.kind==="READ_ITEM"&&<div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Qué objeto leer
        <select className={"mt-1 "+field} value={step.selector}
          onChange={e=>change({selector:e.target.value as typeof step.selector})}>
          {REPAIR_TARGET_SELECTORS.map(selector=>
            <option key={selector} value={selector}>{friendlyMicroKey(selector)}</option>)}
        </select>
      </label>
      <label className="text-xs">Salida del objeto
        <input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-amber-300 sm:col-span-2">La identidad de esta pieza la autoriza el servidor.
       Su puerto naranja solo puede conectarse a un destino de objeto, nunca a una fórmula.</p>
    </div>}
    {step.kind==="READ_STORED"&&<div className="grid gap-2 sm:grid-cols-3">
      <label className="text-xs">Acumulador del usuario
        <input className={"mt-1 "+field} value={step.accumulator}
          onChange={e=>change({accumulator:e.target.value})}/>
      </label>
      <label className="text-xs">Qué leer
        <select className={"mt-1 "+field} value={step.metric}
          onChange={e=>change({metric:e.target.value as "TOTAL"|"COUNT"})}>
          <option value="TOTAL">Valor total almacenado</option>
          <option value="COUNT">Número de cargas</option>
        </select>
      </label>
      <label className="text-xs">Nombre de salida
        <input className={"mt-1 "+field} value={step.output}
          onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-zinc-400 sm:col-span-3">La lectura no consume cargas. Puedes conectar esta salida como variable de una fórmula.</p>
    </div>}
    {step.kind==="CALCULATE"&&<div className="space-y-2">
      <label className="block text-xs">Guardar resultado como
        <input className={"mt-1 "+field} value={step.output}
          onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs">Expresión o fórmula</p>
      <NumericEditor value={step.expression} outputOptions={availableOutputs}
        onChange={expression=>change({expression})}/>
      <p className="text-xs text-zinc-400">La salida queda disponible para las operaciones siguientes; arrástrala en el diagrama.</p>
    </div>}

    {step.kind==="SELECT_TARGET"&&<div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">De quién es el objetivo
        <select className={"mt-1 "+field} value={step.selector} onChange={e=>change({selector:e.target.value as typeof step.selector})}>
          <option value="USER">Invocador</option><option value="OPPONENT">Enemigo</option>
          <option value="ALLY">Aliado autorizado</option><option value="COMBAT">Elegir durante combate</option>
        </select>
      </label>
      <label className="text-xs">Salida de objetivo
        <input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-amber-300 sm:col-span-2">Identidad autorizada por servidor. Esta salida no es numérica ni puede conectarse a una fórmula.</p>
    </div>}
    {step.kind==="SELECT_STAT"&&<div className="space-y-2">
      <label className="block text-xs">Cómo elegir la estadística
        <select className={"mt-1 "+field} value={step.mode} onChange={e=>change({mode:e.target.value as typeof step.mode})}>
          <option value="FIXED">Fijarla al crear el efecto</option>
          <option value="RANDOM">Aleatoria (servidor)</option>
          <option value="COMBAT">Elegir durante combate</option>
        </select>
      </label>
      <label className="block text-xs">Estadísticas permitidas (claves separadas por comas)
        <input className={"mt-1 "+field} value={step.allowed.join(", ")}
          onChange={e=>change({allowed:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)})}/>
      </label>
      {step.mode==="FIXED"&&<label className="block text-xs">Estadística fija
        <select className={"mt-1 "+field} value={step.fixed??""} onChange={e=>change({fixed:e.target.value})}>
          {step.allowed.map(stat=><option key={stat} value={stat}>{friendlyMicroKey(stat)}</option>)}
        </select>
      </label>}
      <label className="block text-xs">Nombre de salida
        <input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-amber-300">Aleatorio/manual requieren una selección autorizada del servidor. No se acepta una estadística fuera de esta lista.</p>
    </div>}
    {step.kind==="READ_HP_DAMAGE"&&<div className="space-y-2">
      <label className="block text-xs">Salida del daño a HP
        <input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-amber-300">Utiliza el disparador «Cuando se resuelve el daño». Conecta esta salida a una condición mayor que 0 para activar efectos solo cuando el HP disminuya.</p>
    </div>}
    {(step.kind==="REQUIRE_CONTACT"||step.kind==="READ_STATUSES"||step.kind==="INVERT_STATUS"||step.kind==="APPLY_STATUS")&&
      <div className="space-y-2">
        <label className="block text-xs">Objetivo conectado desde «Seleccionar objetivo»
          <select className={"mt-1 "+field} value={step.target.key}
            onChange={e=>change({target:{source:"OUTPUT",key:e.target.value}})}>
            <option value="" disabled>Selecciona una salida anterior</option>
            {availableTargetOutputs.map(output=><option key={output} value={output}>{friendlyMicroKey(output)}</option>)}
          </select>
        </label>
        {!availableTargetOutputs.includes(step.target.key)&&
          <p role="alert" className="text-xs text-amber-300">Añade primero «Seleccionar objetivo» y enlaza su salida.</p>}
      </div>}
    {step.kind==="SUMMON_ENTITY"&&<div className="space-y-2">
      <p className="text-xs text-amber-300">Solicita una invocación. La aparición, pago, duración, integridad y PA/ticks necesitan autorización del motor de combate.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Identificador de criatura
          <input className={"mt-1 "+field} value={step.entityKey} onChange={e=>change({entityKey:e.target.value})}/>
        </label>
        <label className="text-xs">Nombre visible
          <input className={"mt-1 "+field} value={step.label} onChange={e=>change({label:e.target.value})}/>
        </label>
        {([
          ["manaCost","Maná al invocar"],["maintenanceMana","Maná de mantenimiento/turno"],
          ["durationTurns","Duración en turnos"],["controlRangeMeters","Control en metros"],
          ["hitLimit","Máximo de impactos"]
        ] as const).map(([k,label])=><label key={k} className="text-xs">{label}
          <input type="number" min={k==="maintenanceMana"||k==="manaCost"?0:1} step={k==="controlRangeMeters"?"any":1}
            className={"mt-1 "+field} value={step[k]} onChange={e=>change({[k]:Number(e.target.value)})}/>
        </label>)}
      </div>
    </div>}
    {step.kind==="LINK_ENTITY_STAT"&&<div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Identificador de criatura
          <input className={"mt-1 "+field} value={step.entityKey} onChange={e=>change({entityKey:e.target.value})}/>
        </label>
        <label className="text-xs">Estadística del usuario
          <input className={"mt-1 "+field} value={step.sourceStat} onChange={e=>change({sourceStat:e.target.value})}/>
        </label>
        <label className="text-xs">Estadística de criatura
          <input className={"mt-1 "+field} value={step.destStat} onChange={e=>change({destStat:e.target.value})}/>
        </label>
      </div>
      <p className="text-xs">Factor del vínculo (ej. 0.2 para 20%; 1 para 100%; 2 para 200%)</p>
      <NumericEditor value={step.factor} outputOptions={availableOutputs} onChange={factor=>change({factor})}/>
      <p className="text-xs text-zinc-400">El vínculo se recalcula con las estadísticas efectivas del invocador al resolverlo.</p>
    </div>}
    {step.kind==="SET_ENTITY_STAT"&&<div className="space-y-2">
      <p className="text-xs text-cyan-200">Valor propio y constante de la criatura. No depende del invocador. Puedes combinar este módulo con vínculos dinámicos en otros atributos.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Identificador de criatura
          <input className={"mt-1 "+field} value={step.entityKey} onChange={e=>change({entityKey:e.target.value})}/>
        </label>
        <label className="text-xs">Atributo de la criatura
          <select className={"mt-1 "+field} value={step.destStat} onChange={e=>change({destStat:e.target.value})}>
            {["PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI","INTEGRITY","MOVE_SPEED","PRECISION","DODGE","STRENGTH"].map(stat=>
              <option key={stat} value={stat}>{friendlyMicroKey(stat)}</option>)}
          </select>
        </label>
        <label className="text-xs">Valor fijo
          <input type="number" min={0} max={1000000} step="any" className={"mt-1 "+field}
            value={step.value} onChange={e=>change({value:Number(e.target.value)})}/>
        </label>
      </div>
      <p className="text-xs text-zinc-400">Si eliges Integridad, ese valor será la resistencia inicial real de la criatura, sin calcularla a partir de defensa física del personaje.</p>
    </div>}
    {step.kind==="SET_ENTITY_BEHAVIOR"&&<div className="space-y-2">
      <label className="block text-xs">Identificador de criatura
        <input className={"mt-1 "+field} value={step.entityKey} onChange={e=>change({entityKey:e.target.value})}/>
      </label>
      <label className="block text-xs">Comportamiento inicial
        <select className={"mt-1 "+field} value={step.mode}
          onChange={e=>{const mode=e.target.value as typeof step.mode;
            change({mode,allowedModes:step.allowedModes.includes(mode)?step.allowedModes:[...step.allowedModes,mode]});}}>
          <option value="FOLLOW">Seguir</option><option value="ATTACK">Perseguir y atacar</option>
          <option value="PROTECT">Proteger</option><option value="HOLD">Mantener posición</option>
          <option value="MANUAL">Control manual</option>
        </select>
      </label>
      <fieldset className="space-y-1"><legend className="text-xs">Comportamientos autorizados para cambiar durante combate</legend>
        {(["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"] as const).map(mode=>
          <label key={mode} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={step.allowedModes.includes(mode)} disabled={step.mode===mode}
              onChange={e=>change({allowedModes:e.target.checked?[...step.allowedModes,mode]:step.allowedModes.filter(x=>x!==mode)})}/>
            {friendlyMicroKey(mode)}
          </label>)}
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Objetivo prioritario
          <select className={"mt-1 "+field} value={step.target} onChange={e=>change({target:e.target.value as typeof step.target})}>
            <option value="USER">Invocador</option><option value="OPPONENT">Enemigo</option>
            <option value="ALLY">Aliado</option><option value="COMBAT">Elegir en combate</option>
          </select>
        </label>
        <label className="text-xs">Cuándo aplicar efecto
          <select className={"mt-1 "+field} value={step.trigger} onChange={e=>change({trigger:e.target.value as typeof step.trigger})}>
            <option value="CONTACT">Al tocar</option><option value="HP_DAMAGE">Al causar daño al HP</option>
            <option value="COMMAND">Al recibir orden</option>
          </select>
        </label>
      </div>
    </div>}
    {step.kind==="APPLY_STATUS"&&<div className="space-y-2">
      <label className="block text-xs">Cómo elegir la estadística
        <select className={"mt-1 "+field} value={typeof step.stat==="string"?"FIXED":"SELECTED"}
          onChange={e=>change({stat:e.target.value==="FIXED"?"STR":{source:"STAT_SELECTION",key:availableStatOutputs[0]??"chosenStat"}})}>
          <option value="FIXED">Estadística fija</option><option value="SELECTED">Usar «Seleccionar estadística»</option>
        </select>
      </label>
      {typeof step.stat==="string"?
        <label className="block text-xs">Estadística a modificar
          <input className={"mt-1 "+field} value={step.stat} onChange={e=>change({stat:e.target.value})}/>
        </label>:
        <label className="block text-xs">Salida de selección
          <select className={"mt-1 "+field} value={step.stat.key}
            onChange={e=>change({stat:{source:"STAT_SELECTION",key:e.target.value}})}>
            <option value="" disabled>Selecciona una salida anterior</option>
            {availableStatOutputs.map(output=><option key={output} value={output}>{friendlyMicroKey(output)}</option>)}
          </select>
        </label>}
      <label className="block text-xs">Operación
        <select className={"mt-1 "+field} value={step.operation} onChange={e=>change({operation:e.target.value as typeof step.operation})}>
          <option value="MULTIPLIER">Multiplicar (0.7 = −30%)</option>
          <option value="BONUS">Sumar o restar (−20 = reducir 20)</option>
        </select>
      </label>
      <p className="text-xs">Cantidad / factor</p>
      <NumericEditor value={step.value} outputOptions={availableOutputs} onChange={value=>change({value})}/>
      <label className="block text-xs">Duración en turnos
        <input type="number" min={1} max={100} className={"mt-1 "+field}
          value={step.durationTurns} onChange={e=>change({durationTurns:Number(e.target.value)})}/>
      </label>
    </div>}
    {step.kind==="READ_STATUSES"&&<div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Qué estados contar
        <select className={"mt-1 "+field} value={step.filter} onChange={e=>change({filter:e.target.value as typeof step.filter})}>
          <option value="DEBUFF">Debilitamientos</option><option value="BUFF">Mejoras</option>
          <option value="ALL">Todos</option>
        </select>
      </label>
      <label className="text-xs">Salida del conteo
        <input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/>
      </label>
    </div>}
    {step.kind==="INVERT_STATUS"&&<div className="space-y-2">
      <label className="block text-xs">Debilitamiento a invertir
        <select className={"mt-1 "+field} value={step.selection} onChange={e=>change({selection:e.target.value as typeof step.selection})}>
          <option value="LATEST_DEBUFF">Último debilitamiento activo</option>
          <option value="SELECTED_DEBUFF">Elegido durante el combate</option>
        </select>
      </label>
      <label className="block text-xs">Maná por inversión
        <input type="number" min={0} className={"mt-1 "+field} value={step.manaCost}
          onChange={e=>change({manaCost:Number(e.target.value)})}/>
      </label>
      <label className="block text-xs">Almacén que gana 1 carga si la inversión tiene éxito (opcional)
        <input className={"mt-1 "+field} value={step.chargeAccumulator??""}
          onChange={e=>change({chargeAccumulator:e.target.value||undefined})}/>
      </label>
      <p className="text-xs text-amber-300">La carga no aparece hasta que el servidor haya pagado el maná e invertido el estado de manera efectiva.</p>
    </div>}
    {step.kind==="CAPABILITY"&&<div className="space-y-2">
      <p className="text-xs text-amber-200">Capacidad declarativa: no modifica daño, PV ni estadísticas hasta que tenga un resolutor autorizado.</p>
      <label className="block text-xs">Código de capacidad<input className={"mt-1 "+field} value={step.code} onChange={e=>change({code:e.target.value})} placeholder="CARD:W032 o NARRATIVE:OTHER"/></label>
      <label className="block text-xs">Descripción<textarea className={"mt-1 "+field} rows={3} value={step.description} maxLength={1500} onChange={e=>change({description:e.target.value})}/></label>
      <label className="block text-xs">Objetivo<input className={"mt-1 "+field} value={step.target??""} onChange={e=>change({target:e.target.value||undefined})}/></label>
      <label className="block text-xs">Elemento<input className={"mt-1 "+field} value={step.element??""} onChange={e=>change({element:e.target.value||undefined})}/></label>
    </div>}
    {step.kind==="VARIABLE_RESISTANCE"&&<div className="space-y-2">
      <p className="text-xs text-amber-200">La defensa variable necesita un contexto real de impacto y estadística base. No funciona como bono global del personaje.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Estadística de destino (si no hay conexión)<input className={"mt-1 "+field} value={step.config.baseStat} onChange={e=>change({config:{...step.config,baseStat:e.target.value}})}/></label>
        <label className="text-xs">Propietario de la estadística base (sin conexión)
          <select className={"mt-1 "+field} value={step.config.baseOwner??"USER"}
            onChange={e=>change({config:{...step.config,baseOwner:e.target.value as "USER"|"OPPONENT"}})}>
            <option value="USER">Usuario</option><option value="OPPONENT">Oponente</option>
          </select>
        </label>
        <label className="text-xs">Propietario de la variable (sin conexión)
          <select className={"mt-1 "+field}
            value={step.config.inputOwner??(["HIT_COUNT","HP_PERCENT"].includes(step.config.input)?"USER":"OPPONENT")}
            onChange={e=>change({config:{...step.config,inputOwner:e.target.value as "USER"|"OPPONENT"}})}>
            <option value="USER">Usuario</option><option value="OPPONENT">Oponente</option>
          </select>
        </label>
        <label className="text-xs">Variable<select className={"mt-1 "+field} value={step.config.input} onChange={e=>change({config:{...step.config,input:e.target.value as typeof step.config.input}})}>
          {["ATTACK_SPEED","INCOMING_DAMAGE","HIT_COUNT","HP_PERCENT"].map(v=><option key={v} value={v}>{MICRO_INPUT_LABELS[v]}</option>)}</select></label>
        <label className="text-xs">Fórmula<select className={"mt-1 "+field} value={step.config.formula} onChange={e=>change({config:{...step.config,formula:e.target.value as typeof step.config.formula}})}>
          {["PROGRESSIVE","LINEAR","DECREASING","THRESHOLD","HITS"].map(v=><option key={v} value={v}>{MICRO_FORMULA_LABELS[v]}</option>)}</select></label>
        {(["threshold","coefficient","minMultiplier","maxMultiplier"] as const).map(k=><label key={k} className="text-xs">{MICRO_CONFIG_LABELS[k]}<input type="number" step="any" className={"mt-1 "+field} value={step.config[k]} onChange={e=>change({config:{...step.config,[k]:Number(e.target.value)}})}/></label>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={step.base!==undefined}
              onChange={e=>change({base:e.target.checked?(availableOutputs.length?{source:"OUTPUT",key:availableOutputs[availableOutputs.length-1]}:1):undefined})}/>
            Conectar un valor base personalizado
          </label>
          {step.base===undefined?<p className="text-xs text-cyan-300">Se lee {friendlyMicroKey(step.config.baseStat)} del {step.config.baseOwner==="OPPONENT"?"oponente":"usuario"}.</p>:
            <NumericEditor value={step.base} outputOptions={availableOutputs} onChange={base=>change({base})}/>}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={step.input!==undefined}
              onChange={e=>change({input:e.target.checked?(availableOutputs.length?{source:"OUTPUT",key:availableOutputs[availableOutputs.length-1]}:1):undefined})}/>
            Conectar una variable personalizada
          </label>
          {step.input===undefined?<p className="text-xs text-cyan-300">Se lee {friendlyMicroKey(step.config.input)} del {(step.config.inputOwner??(["HIT_COUNT","HP_PERCENT"].includes(step.config.input)?"USER":"OPPONENT"))==="USER"?"usuario":"oponente"}.</p>:
            <NumericEditor value={step.input} outputOptions={availableOutputs} onChange={input=>change({input})}/>}
        </div>
      </div>
      <p className="text-xs text-zinc-400">Usa «Resultado de otro módulo» para conectar pasos anteriores de estadísticas, acumuladores o consumo. También puedes usar números, eventos o fórmulas.</p>
    </div>}
    {step.kind==="REPAIR_DURABILITY"&&<div className="space-y-3">
      <p className="text-xs text-cyan-200">Restaurar durabilidad de un objeto real. La cantidad y el objetivo son conectables;
       el sistema aplica un máximo de 100 puntos y comprueba los permisos.</p>
      <label className="block text-xs">Objetivo (salida de «Leer objeto»)
        <select aria-label="Objeto a reparar" className={"mt-1 "+field}
          value={availableItemOutputs.includes(step.target.key)?step.target.key:""}
          onChange={e=>change({target:{source:"OUTPUT",key:e.target.value}})}>
          <option value="" disabled>Selecciona una salida de objeto anterior</option>
          {availableItemOutputs.map(output=>
            <option key={output} value={output}>{friendlyMicroKey(output)}</option>)}
        </select>
      </label>
      {!availableItemOutputs.includes(step.target.key)&&
        <p role="alert" className="text-xs text-amber-300">Añade «Leer objeto» antes de esta reparación y conecta su salida naranja.</p>}
      <label className="block text-xs">Cantidad a restaurar</label>
      <NumericEditor value={step.amount} outputOptions={availableOutputs}
        onChange={amount=>change({amount})}/>
      <p className="text-xs text-zinc-400">Se calcula una intención de reparación, no una reparación gratuita:
       habilidades, objetos y servicios deben autorizar y pagar su activación.</p>
    </div>}
    {step.kind==="STORE"&&<div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Acumulador<input className={"mt-1 "+field} value={step.accumulator} onChange={e=>change({accumulator:e.target.value})}/></label>
      <label className="text-xs">Máximo de cargas<input className={"mt-1 "+field} type="number" min={1} max={100} value={step.capacity} onChange={e=>change({capacity:Number(e.target.value)})}/></label>
      <div className="sm:col-span-2"><p className="mb-1 text-xs">Valor a almacenar</p><NumericEditor value={step.value} outputOptions={availableOutputs} onChange={value=>change({value})}/></div>
    </div>}
    {step.kind==="CONSUME"&&<div className="grid gap-2 sm:grid-cols-3">
      <label className="text-xs">Acumulador<input className={"mt-1 "+field} value={step.accumulator} onChange={e=>change({accumulator:e.target.value})}/></label>
      <label className="text-xs">Guardar total en<input className={"mt-1 "+field} value={step.output} onChange={e=>change({output:e.target.value})}/></label>
      <label className="text-xs">Cargas a consumir<select className={"mt-1 "+field} value={step.charges==="ALL"?"ALL":"NUMBER"} onChange={e=>change({charges:e.target.value==="ALL"?"ALL":1})}>
        <option value="ALL">Todas</option><option value="NUMBER">Cantidad</option></select>
        {step.charges!=="ALL"&&<input type="number" min={1} max={100} className={"mt-1 "+field} value={step.charges} onChange={e=>change({charges:Number(e.target.value)})}/>}</label>
    </div>}
    {(step.kind==="HEAL"||step.kind==="DAMAGE"||step.kind==="BONUS"||step.kind==="MODIFIER")&&
      <div className="space-y-2">
        {step.kind==="DAMAGE"&&<div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Canal<select className={"mt-1 "+field} value={step.channel} onChange={e=>change({channel:e.target.value as "PHYSICAL"|"MAGICAL"})}>
            <option value="PHYSICAL">Físico</option><option value="MAGICAL">Mágico</option></select></label>
          <label className="text-xs">Elemento (opcional)<input className={"mt-1 "+field} value={step.element??""} onChange={e=>change({element:e.target.value||undefined})}/></label>
        </div>}
        {(step.kind==="BONUS"||step.kind==="MODIFIER")&&<label className="block text-xs">Estadística o destino
          <select aria-label="Destino del efecto" className={"mt-1 "+field}
            value={destinationStats.includes(step.stat)?step.stat:"__CUSTOM__"}
            onChange={e=>change({stat:e.target.value==="__CUSTOM__"?"":e.target.value})}>
            {destinationStats.map(code=><option key={code} value={code}>{friendlyMicroKey(code)}</option>)}
            <option value="__CUSTOM__">Otro destino (avanzado)</option>
          </select>
          {!destinationStats.includes(step.stat)&&<input aria-label="Clave de destino personalizada" className={"mt-1 "+field}
            value={step.stat} onChange={e=>change({stat:e.target.value})} placeholder="Clave interna"/>}
        </label>}
        <p className="text-xs">{step.kind==="MODIFIER"?"Multiplicador":step.kind==="HEAL"?"Curación":step.kind==="DAMAGE"?"Daño":"Bono a sumar"}</p>
        <NumericEditor value={step.kind==="MODIFIER"?step.multiplier:step.amount} outputOptions={availableOutputs} onChange={value=>change(step.kind==="MODIFIER"?{multiplier:value}:{amount:value})}/>
        {step.kind==="DAMAGE"&&<div className="space-y-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={step.radiusMeters!==undefined} onChange={e=>change({radiusMeters:e.target.checked?1:undefined})}/>Área circular</label>
          {step.radiusMeters!==undefined&&<NumericEditor value={step.radiusMeters} outputOptions={availableOutputs} onChange={radiusMeters=>change({radiusMeters})}/>}
        </div>}
      </div>}
    <ConditionsEditor title="Condicionales de este micromódulo" value={step.when??[]} onChange={when=>change({when})}/>
  </section>;
}
export function MicroEffectBuilder({value,onChange}:{value:EffectContainer;onChange:(next:EffectContainer)=>void}){
  const [showFlow,setShowFlow]=useState(true);
  const [newKind,setNewKind]=useState<MicroStep["kind"]>("SELECT_TARGET");
  const [selectedStep,setSelectedStep]=useState<number|null>(null);
  const update=(patch:Partial<EffectContainer>)=>onChange({...value,...patch});
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Nombre<input className={"mt-1 "+field} maxLength={120} value={value.name} onChange={e=>update({name:e.target.value})}/></label>
      <details className="text-xs sm:col-span-1"><summary className="cursor-pointer text-zinc-400">Opciones técnicas (avanzado)</summary>
        <label className="mt-2 block">Clave interna del tipo
          <input className={"mt-1 "+field} maxLength={64} value={value.type} onChange={e=>update({type:e.target.value})}/>
        </label><p className="mt-1 text-zinc-500">Normalmente no necesitas cambiar esta clave.</p>
      </details>
      <label className="sm:col-span-2 text-xs">Descripción<textarea className={"mt-1 "+field} rows={2} maxLength={2000} value={value.description} onChange={e=>update({description:e.target.value})}/></label>
      <label className="text-xs">Disparador<select className={"mt-1 "+field} value={value.trigger} onChange={e=>update({trigger:e.target.value as MicroEvent,impactKind:e.target.value==="IMPACT"?value.impactKind:undefined})}>
        {events.map(t=><option key={t} value={t}>{MICRO_TRIGGER_LABELS[t]}</option>)}</select></label>
      {value.trigger==="IMPACT"&&<label className="text-xs">Impacto<select className={"mt-1 "+field} value={value.impactKind??""} onChange={e=>update({impactKind:e.target.value?e.target.value as "GROUND"|"CHARACTER":undefined})}>
        <option value="">Cualquier impacto</option><option value="CHARACTER">Personaje</option><option value="GROUND">Suelo</option></select></label>}
    </div>
    <ConditionsEditor title="Requisitos para ejecutar este efecto" value={value.requirements??[]} onChange={requirements=>update({requirements})}/>
    <div className="flex items-center justify-end gap-2">
      <button type="button" className="rounded-lg border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200"
        aria-expanded={showFlow} onClick={()=>setShowFlow(v=>!v)}>
        {showFlow?"Ocultar diagrama":"Mostrar diagrama"}
      </button>
    </div>
    {showFlow&&<MicroEffectFlowEditor value={value} onChange={onChange} onEditStep={index=>{setSelectedStep(index);document.getElementById("micro-step-"+index)?.scrollIntoView({behavior:"smooth",block:"center"});}}/>}
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Pasos del efecto (en orden)</h3>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Micromódulo a añadir" className={field} value={newKind}
          onChange={e=>setNewKind(e.target.value as MicroStep["kind"])}>
          {stepKinds.map(kind=><option key={kind} value={kind}>{MICRO_STEP_LABELS[kind]}</option>)}
        </select>
        <button type="button" disabled={value.steps.length>=24}
          className="rounded border border-teal-600 px-3 py-2 text-xs disabled:opacity-40"
          onClick={()=>{
            let next=defaultStep(newKind);
            if("output" in next){
              const used=new Set(value.steps.flatMap(s=>"output" in s?[s.output]:[]));
              const base=next.output;let name=base,n=1;
              while(used.has(name))name=base+"_"+n++;
              next={...next,output:name};
            }
            update({steps:[...value.steps,next]});
          }}>+ Añadir micromódulo</button>
      </div>
      <button type="button" disabled={value.steps.length>19}
        className="rounded border border-teal-700 px-3 py-2 text-xs disabled:opacity-40"
        onClick={()=>{
          const keys=new Set(value.steps.flatMap(s=>"entityKey" in s?[s.entityKey]:[]));
          let entityKey="FAMILIAR",n=1;while(keys.has(entityKey))entityKey="FAMILIAR_"+n++;
          update({steps:[...value.steps,
            {kind:"SUMMON_ENTITY",entityKey,label:"Familiar",manaCost:30,maintenanceMana:20,durationTurns:2,controlRangeMeters:15,hitLimit:3},
            {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor:0.2},
            {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"AGI",destStat:"AGI",factor:1},
            {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
            {kind:"SET_ENTITY_BEHAVIOR",entityKey,mode:"FOLLOW",allowedModes:["FOLLOW","ATTACK","MANUAL"],target:"USER",trigger:"CONTACT"}
          ]});
        }}>+ Familiar de ejemplo (5 nodos)</button>
      <button type="button" disabled={value.steps.length>21}
        className="rounded border border-violet-700 px-3 py-2 text-xs disabled:opacity-40"
        onClick={()=>{
          const used=new Set(value.steps.filter((s):s is Extract<MicroStep,{output:string}>=>"output" in s).map(s=>s.output));
          const free=(base:string)=>{let i=1,key=base;while(used.has(key)){key=base+"_"+i++;}used.add(key);return key;};
          const a=free("resistanceBase"),b=free("resistanceInput");
          update({steps:[...value.steps,
            {kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:a},
            {kind:"READ_STAT",actor:"OPPONENT",stat:"ATTACK_SPEED",output:b},
            {kind:"VARIABLE_RESISTANCE",config:{...DEFAULT_VARIABLE_RESISTANCE},
              base:{source:"OUTPUT",key:a},input:{source:"OUTPUT",key:b}}]});
        }}>+ Resistencia con fuentes conectadas</button>
      <button type="button" disabled={value.steps.length>=24} className="rounded border border-cyan-800 px-3 py-2 text-xs disabled:opacity-40" onClick={()=>{
        const names=new Set(value.steps.filter((s):s is Extract<MicroStep,{output:string}>=>"output" in s).map(s=>s.output));
        let n=1;while(names.has("calculated"+n))n++;
        update({steps:[...value.steps,{kind:"CALCULATE",output:"calculated"+n,expression:1}]});
      }}>+ Valor/cálculo</button>
      <button type="button" disabled={value.steps.length>21}
        className="rounded border border-amber-700 px-3 py-2 text-xs disabled:opacity-40"
        onClick={()=>{
          const used=new Set(value.steps.flatMap(s=>"output" in s?[s.output]:[]));
          const free=(base:string)=>{let i=0,code=base;while(used.has(code))code=base+ ++i;used.add(code);return code;};
          const itemOutput=free("selectedItem"),amountOutput=free("repairAmount");
          update({steps:[...value.steps,
            {kind:"READ_ITEM",selector:"SELECTED_ITEM",output:itemOutput},
            {kind:"CALCULATE",expression:10,output:amountOutput},
            {kind:"REPAIR_DURABILITY",target:{source:"OUTPUT",key:itemOutput},
              amount:{source:"OUTPUT",key:amountOutput}}]});
        }}>+ Reparación con objetivo y cantidad conectados</button>
      <button type="button" disabled={value.steps.length>=24} className="rounded border border-cyan-800 px-3 py-2 text-xs disabled:opacity-40" onClick={()=>update({steps:[...value.steps,defaultStep("HEAL")]})}>+ Curación</button>
    </div>
    {value.steps.map((step,index)=><div key={index} id={"micro-step-"+index} className={"space-y-1 rounded-xl "+(selectedStep===index?"ring-2 ring-cyan-500":"")}>
      <div className="flex items-center justify-between gap-2 text-xs">
        {selectedStep===index?<span className="pl-2 font-semibold text-cyan-300">Nodo seleccionado en el diagrama</span>:<span/>}
        <div className="flex gap-2">
        <button type="button" disabled={index===0} onClick={()=>{const next=[...value.steps];[next[index-1],next[index]]=[next[index],next[index-1]];update({steps:next});}} className="disabled:opacity-30">↑ Subir</button>
        <button type="button" disabled={index===value.steps.length-1} onClick={()=>{const next=[...value.steps];[next[index+1],next[index]]=[next[index],next[index+1]];update({steps:next});}} className="disabled:opacity-30">↓ Bajar</button>
        </div>
      </div>
      <StepEditor step={step} index={index}
        availableOutputs={value.steps.slice(0,index).filter((s):s is Extract<MicroStep,{output:string}>=>"output" in s&&
          !["READ_ITEM","SELECT_TARGET","SELECT_STAT"].includes(s.kind)).map(s=>s.output)}
        availableTargetOutputs={value.steps.slice(0,index).filter((s):s is Extract<MicroStep,{kind:"SELECT_TARGET"}>=>s.kind==="SELECT_TARGET").map(s=>s.output)}
        availableStatOutputs={value.steps.slice(0,index).filter((s):s is Extract<MicroStep,{kind:"SELECT_STAT"}>=>s.kind==="SELECT_STAT").map(s=>s.output)}
        availableItemOutputs={value.steps.slice(0,index).filter((s):s is Extract<MicroStep,{kind:"READ_ITEM"}>=>s.kind==="READ_ITEM").map(s=>s.output)}
        onChange={next=>update({steps:value.steps.map((x,i)=>i===index?next:x)})}
        onDelete={()=>update({steps:value.steps.filter((_,i)=>i!==index)})}/>
    </div>)}
    <p className="text-xs text-zinc-500">Los pasos se ejecutan en el orden indicado. Los resultados de un paso pueden conectarse a pasos posteriores del mismo efecto: leer estadística de usuario/oponente, leer acumulador o consumir cargas. Reordenar o eliminar un módulo productor puede dejar una conexión inválida; el servidor la valida.</p>
  </section>;
}
