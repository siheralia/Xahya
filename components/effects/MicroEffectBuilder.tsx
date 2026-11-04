"use client";

import type {EffectContainer,MicroStep,MicroCondition,NumericExpr,MicroEvent} from "@/lib/effects/micro-modules";
import {DEFAULT_VARIABLE_RESISTANCE} from "@/lib/skills/variable-resistance";

const field="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100";
const key="^[A-Za-z][A-Za-z0-9_.:-]{0,63}$";
const sources=["EVENT","STAT","CHARGES","STORED_TOTAL","OUTPUT"] as const;
const ops=["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX","PERCENT"] as const;
const events:MicroEvent[]=["DAMAGE_RESOLVED","TURN_START","IMPACT","PASSIVE"];
const defaultCondition=():MicroCondition=>({left:{source:"CHARGES",key:"DIVINE_GRACE"},compare:"GTE",right:1});
const ref=():NumericExpr=>({source:"STAT",key:"MAX_HP"});
const op=():NumericExpr=>({operator:"PERCENT",args:[ref(),10]});
const defaultStep=(kind:MicroStep["kind"]):MicroStep=>{
  switch(kind){
    case "STORE":return {kind,accumulator:"ENERGY",capacity:5,value:{source:"EVENT",key:"MITIGATED_DAMAGE"}};
    case "CONSUME":return {kind,accumulator:"ENERGY",output:"energy",charges:"ALL"};
    case "READ_STAT":return {kind,actor:"USER",stat:"magicDefense",output:"resistanceBase"};
    case "READ_STORED":return {kind,accumulator:"ENERGY",metric:"TOTAL",output:"storedTotal"};
    case "HEAL":return {kind,amount:op()};
    case "DAMAGE":return {kind,amount:10,channel:"MAGICAL"};
    case "MODIFIER":return {kind,stat:"RESISTANCE",multiplier:1.3};
    case "BONUS":return {kind,stat:"STR",amount:10};
    case "CAPABILITY":return {kind,code:"NARRATIVE:OTHER",description:""};
    case "VARIABLE_RESISTANCE":return {kind,config:{...DEFAULT_VARIABLE_RESISTANCE},
      base:{source:"STAT",key:"magicDefense"},input:{source:"EVENT",key:"ATTACK_SPEED"}};
  }
};
export function freshMicroEffect():EffectContainer{
  return {id:"MODULE_"+crypto.randomUUID().replaceAll("-",""),name:"Nuevo efecto",
    type:"COMPOSED",description:"",trigger:"PASSIVE",steps:[defaultStep("MODIFIER")]};
}
function NumericEditor({value,onChange,depth=0,outputOptions=[]}:{value:NumericExpr;onChange:(value:NumericExpr)=>void;depth?:number;outputOptions?:string[]}){
  const kind=typeof value==="number"?"NUMBER":"source" in value?"REFERENCE":"OPERATION";
  return <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
    <select aria-label="Tipo de valor" className={field} value={kind} onChange={e=>{
      const v=e.target.value;
      onChange(v==="NUMBER"?1:v==="REFERENCE"?{source:"STAT",key:"MAX_HP"}:{operator:"ADD",args:[1,1]});
    }}>
      <option value="NUMBER">Número fijo</option><option value="REFERENCE">Referencia</option><option value="OPERATION">Operación</option>
    </select>
    {typeof value==="number"?<input aria-label="Número" type="number" step="any" className={field} value={value} onChange={e=>onChange(Number(e.target.value))}/>:
      "source" in value?<div className="grid grid-cols-2 gap-2">
        <select aria-label="Origen de referencia" className={field} value={value.source} onChange={e=>onChange({...value,source:e.target.value as typeof value.source})}>
          {sources.map(source=><option key={source} value={source}>{source}</option>)}
        </select>
        {value.source==="OUTPUT"&&outputOptions.length>0?
          <select aria-label="Salida de micromódulo anterior" className={field}
            value={outputOptions.includes(value.key)?value.key:""}
            onChange={e=>onChange({...value,key:e.target.value})}>
            <option value="" disabled>Selecciona salida anterior</option>
            {outputOptions.map(key=><option key={key} value={key}>{key}</option>)}
          </select>:
          <input aria-label="Clave de referencia" pattern={key} className={field} value={value.key} onChange={e=>onChange({...value,key:e.target.value})} placeholder="HP, STR, ENERGY…"/>}
      </div>:
      <div className="space-y-2">
        <select aria-label="Operación matemática" className={field} value={value.operator} onChange={e=>{
          const next=e.target.value as typeof value.operator;
          const binary=["DIVIDE","SUBTRACT","PERCENT"].includes(next);
          onChange({operator:next,args:binary?value.args.slice(0,2).concat(Array(Math.max(0,2-value.args.length)).fill(1)):value.args});
        }}>{ops.map(n=><option key={n} value={n}>{n}</option>)}</select>
        {depth>=4?<p role="note" className="text-xs text-amber-300">Expresión demasiado profunda para esta vista; reduce los niveles.</p>:
          value.args.map((arg,i)=><div key={i} className="space-y-1">
            <span className="text-xs text-zinc-400">Argumento {i+1}</span>
            <NumericEditor value={arg} depth={depth+1} outputOptions={outputOptions} onChange={next=>onChange({...value,args:value.args.map((x,j)=>j===i?next:x)})}/>
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
        {["EQ","NE","GT","GTE","LT","LTE"].map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <span className="text-xs">Valor derecho</span>
      <NumericEditor value={item.right} onChange={right=>onChange(value.map((x,j)=>j===i?{...x,right}:x))}/>
    </div>)}
  </section>;
}
function StepEditor({step,onChange,onDelete,index,availableOutputs}:{step:MicroStep;onChange:(s:MicroStep)=>void;onDelete:()=>void;index:number;availableOutputs:string[]}){
  const change=(patch:Partial<MicroStep>)=>onChange({...step,...patch} as MicroStep);
  return <section className="space-y-3 rounded-xl border border-cyan-900/60 bg-zinc-900/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Micromódulo {index+1}</h4>
      <button type="button" onClick={onDelete} className="text-xs text-rose-300">Eliminar</button></div>
    <label className="block text-xs">Operación<select className={"mt-1 "+field} value={step.kind} onChange={e=>onChange({...defaultStep(e.target.value as MicroStep["kind"]),when:step.when})}>
      {["STORE","CONSUME","READ_STAT","READ_STORED","HEAL","DAMAGE","MODIFIER","BONUS","CAPABILITY","VARIABLE_RESISTANCE"].map(kind=><option key={kind} value={kind}>{kind}</option>)}
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
        <input className={"mt-1 "+field} value={step.stat}
          onChange={e=>change({stat:e.target.value})} placeholder="magicDefense, ATTACK_SPEED..."/>
      </label>
      <label className="text-xs">Nombre de salida
        <input className={"mt-1 "+field} value={step.output}
          onChange={e=>change({output:e.target.value})}/>
      </label>
      <p className="text-xs text-zinc-400 sm:col-span-3">Lee un valor real del combate sin modificarlo. El oponente se resuelve desde el servidor, no desde el navegador.</p>
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
        <label className="text-xs">Variable<select className={"mt-1 "+field} value={step.config.input} onChange={e=>change({config:{...step.config,input:e.target.value as typeof step.config.input}})}>
          {["ATTACK_SPEED","INCOMING_DAMAGE","HIT_COUNT","HP_PERCENT"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label className="text-xs">Fórmula<select className={"mt-1 "+field} value={step.config.formula} onChange={e=>change({config:{...step.config,formula:e.target.value as typeof step.config.formula}})}>
          {["PROGRESSIVE","LINEAR","DECREASING","THRESHOLD","HITS"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        {(["threshold","coefficient","minMultiplier","maxMultiplier"] as const).map(k=><label key={k} className="text-xs">{k}<input type="number" step="any" className={"mt-1 "+field} value={step.config[k]} onChange={e=>change({config:{...step.config,[k]:Number(e.target.value)}})}/></label>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Conectar valor base (defensa)</p>
          <NumericEditor value={step.base??{source:"STAT",key:step.config.baseStat}}
            outputOptions={availableOutputs} onChange={base=>change({base})}/>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Conectar variable de respuesta</p>
          <NumericEditor value={step.input??{source:"EVENT",key:step.config.input}}
            outputOptions={availableOutputs} onChange={input=>change({input})}/>
        </div>
      </div>
      <p className="text-xs text-zinc-400">Usa OUTPUT para conectar módulos anteriores de estadísticas, acumuladores o consumo. También puedes usar números, eventos o fórmulas.</p>
    </div>}
    {step.kind==="STORE"&&<div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Acumulador<input className={"mt-1 "+field} value={step.accumulator} onChange={e=>change({accumulator:e.target.value})}/></label>
      <label className="text-xs">Máximo de cargas<input className={"mt-1 "+field} type="number" min={1} max={100} value={step.capacity} onChange={e=>change({capacity:Number(e.target.value)})}/></label>
      <div className="sm:col-span-2"><p className="mb-1 text-xs">Valor a almacenar</p><NumericEditor value={step.value} onChange={value=>change({value})}/></div>
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
        {(step.kind==="BONUS"||step.kind==="MODIFIER")&&<label className="block text-xs">Estadística o destino<input className={"mt-1 "+field} value={step.stat} onChange={e=>change({stat:e.target.value})}/></label>}
        <p className="text-xs">{step.kind==="MODIFIER"?"Multiplicador":step.kind==="HEAL"?"Curación":step.kind==="DAMAGE"?"Daño":"Bono a sumar"}</p>
        <NumericEditor value={step.kind==="MODIFIER"?step.multiplier:step.amount} onChange={value=>change(step.kind==="MODIFIER"?{multiplier:value}:{amount:value})}/>
        {step.kind==="DAMAGE"&&<div className="space-y-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={step.radiusMeters!==undefined} onChange={e=>change({radiusMeters:e.target.checked?1:undefined})}/>Área circular</label>
          {step.radiusMeters!==undefined&&<NumericEditor value={step.radiusMeters} onChange={radiusMeters=>change({radiusMeters})}/>}
        </div>}
      </div>}
    <ConditionsEditor title="Condicionales de este micromódulo" value={step.when??[]} onChange={when=>change({when})}/>
  </section>;
}
export function MicroEffectBuilder({value,onChange}:{value:EffectContainer;onChange:(next:EffectContainer)=>void}){
  const update=(patch:Partial<EffectContainer>)=>onChange({...value,...patch});
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Nombre<input className={"mt-1 "+field} maxLength={120} value={value.name} onChange={e=>update({name:e.target.value})}/></label>
      <label className="text-xs">Tipo<input className={"mt-1 "+field} maxLength={64} value={value.type} onChange={e=>update({type:e.target.value})}/></label>
      <label className="sm:col-span-2 text-xs">Descripción<textarea className={"mt-1 "+field} rows={2} maxLength={2000} value={value.description} onChange={e=>update({description:e.target.value})}/></label>
      <label className="text-xs">Disparador<select className={"mt-1 "+field} value={value.trigger} onChange={e=>update({trigger:e.target.value as MicroEvent,impactKind:e.target.value==="IMPACT"?value.impactKind:undefined})}>
        {events.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
      {value.trigger==="IMPACT"&&<label className="text-xs">Impacto<select className={"mt-1 "+field} value={value.impactKind??""} onChange={e=>update({impactKind:e.target.value?e.target.value as "GROUND"|"CHARACTER":undefined})}>
        <option value="">Cualquier impacto</option><option value="CHARACTER">Personaje</option><option value="GROUND">Suelo</option></select></label>}
    </div>
    <ConditionsEditor title="Requisitos para ejecutar este efecto" value={value.requirements??[]} onChange={requirements=>update({requirements})}/>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Micromódulos y orden de ejecución</h3>
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
      <button type="button" disabled={value.steps.length>=24} className="rounded border border-cyan-800 px-3 py-2 text-xs disabled:opacity-40" onClick={()=>update({steps:[...value.steps,defaultStep("HEAL")]})}>+ Micromódulo</button>
    </div>
    {value.steps.map((step,index)=><div key={index} className="space-y-1">
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" disabled={index===0} onClick={()=>{const next=[...value.steps];[next[index-1],next[index]]=[next[index],next[index-1]];update({steps:next});}} className="disabled:opacity-30">↑ Subir</button>
        <button type="button" disabled={index===value.steps.length-1} onClick={()=>{const next=[...value.steps];[next[index+1],next[index]]=[next[index],next[index+1]];update({steps:next});}} className="disabled:opacity-30">↓ Bajar</button>
      </div>
      <StepEditor step={step} index={index}
        availableOutputs={value.steps.slice(0,index).filter((s):s is Extract<MicroStep,{output:string}>=>"output" in s).map(s=>s.output)}
        onChange={next=>update({steps:value.steps.map((x,i)=>i===index?next:x)})}
        onDelete={()=>update({steps:value.steps.filter((_,i)=>i!==index)})}/>
    </div>)}
    <p className="text-xs text-zinc-500">Los módulos se evalúan en el orden indicado. Las salidas OUTPUT conectan módulos anteriores del mismo efecto: leer estadística de usuario/oponente, leer acumulador o consumir cargas. Reordenar o eliminar un módulo productor puede dejar una conexión inválida; el servidor la valida.</p>
  </section>;
}
