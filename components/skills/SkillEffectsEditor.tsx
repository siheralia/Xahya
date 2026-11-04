"use client";
import { useState } from "react";
import {SharedEffectsEditor} from "@/components/effects/SharedEffectsEditor";
import { EFFECT_CATALOG, resolveEffectTargets } from "@/lib/effects/catalog";
import { effectPchCost, skillEffectMultiplier } from "@/lib/skills/pch";
import { ElementSelect } from "@/components/effects/ElementSelect";
import { SkillFieldHelp } from "./SkillFieldHelp";
import { COPY_MODES } from "@/lib/skills/copy";
import { MicroEffectBuilder,freshMicroEffect } from "@/components/effects/MicroEffectBuilder";
import {isComposedSkillEffect,composedEffectBasePch} from "@/lib/skills/composed-effects";
import type {EffectContainer} from "@/lib/effects/micro-modules";
export type EditableEffect = {type:string;module?:EffectContainer;pricingNotes?:string;reviewedPch?:number;capability?:string;element?:string;target?:string;value?:number;description?:string;durationTurns?:number;durationMovements?:number;targetKind?:"SELF"|"CHARACTER"|"OPPONENT"|"EXISTING_OBJECT";targetReference?:string;activationCondition?:"NONE"|"LOW_HEALTH"|"NIGHT_ONLY"|"ONCE_PER_COMBAT"|"THREE_PER_COMBAT";copyMode?:"PERMANENT"|"TEMPORARY"|"IMITATION"|"COLLECTION";copyDurationTurns?:number;copyCapacity?:number;copyFidelityPercent?:number;copyAllowSpecial?:boolean;copyAllowRacial?:boolean;stealDurationTurns?:number;stealCapacity?:number;stealFidelityPercent?:number;stealAllowSpecial?:boolean;stealAllowRacial?:boolean;stealBodyCoercion?:boolean};
export type NarrativeCard = {id:string|number;name:string;description:string;category?:string;pch?:number};
type Props<E extends EditableEffect>={effects:E[];onChange:(effects:E[])=>void;statistics?:{key:string;name:string;kind:"basic"|"derived";active?:boolean}[];narrativeCards?:NarrativeCard[];effectDefinitions?:{type:string;label:string;targets:{key:string;label:string}[]}[];priceEffect?:(effect:E)=>number;allowReviewModularPch?:boolean};
const cls="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm";
export function SkillEffectsEditor<E extends EditableEffect>({effects,onChange,statistics=[],narrativeCards=[],effectDefinitions,priceEffect,allowReviewModularPch=false}:Props<E>){
 const [search,setSearch]=useState("");const [open,setOpen]=useState(false);const [category,setCategory]=useState("Todos");
 // Use the same live catalog as server pricing and validation; do not rebuild
 // dynamic attack targets from stale static effect definitions.
 const targetsFor=(type:string)=>effectDefinitions?.find(def=>def.type===type)?.targets??resolveEffectTargets(type,statistics);
 const typesForEditor=(effectDefinitions??EFFECT_CATALOG).filter(e=>e.type!=="COMBAT_MULTIPLIER").map(e=>[e.type,e.label] as const);
 const update=(index:number,patch:Partial<E>)=>onChange(effects.map((e,i)=>i===index?{...e,...patch}:e));
 const add=(effect:EditableEffect)=>{onChange([...effects,effect as E]);setOpen(false);};
 const catalog=(effectDefinitions ?? EFFECT_CATALOG.map(e=>({...e,targets:e.targets.map(key=>({key,label:key}))}))).filter(e=>e.type!=="COMBAT_MULTIPLIER" && (e.label+" "+e.type).toLowerCase().includes(search.toLowerCase()) && (category==="Todos" || (category==="Estadísticas"&&/STAT|BONUS/.test(e.type)) || (category==="Combate"&&/DAMAGE|COMBAT|DEF/.test(e.type)) || (category==="Recursos"&&/RESOURCE|HEAL/.test(e.type)) || category==="Especiales"));
 return <section className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Efectos <SkillFieldHelp field="effects"/></h3><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>add({type:"COMPOSED",module:freshMicroEffect(),pricingNotes:""})} className="rounded-lg border border-violet-600/70 bg-violet-950/30 px-3 py-2 text-sm text-violet-200">+ Crear efecto modular</button><button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} className={cls}>+ Buscar efecto</button></div></div>
  {open&&<div className="mt-3 space-y-3 rounded-xl border border-cyan-800/50 bg-zinc-950 p-3"><input aria-label="Buscar efectos" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar efectos…" className={"w-full "+cls}/><div className="flex flex-wrap gap-2">{["Todos","Combate","Estadísticas","Recursos","Especiales"].map(c=><button key={c} type="button" onClick={()=>setCategory(c)} aria-pressed={category===c} className={"rounded-full border px-3 py-1 text-xs "+(category===c?"border-cyan-400 text-cyan-200":"border-zinc-700")}>{c}</button>)}</div>
   <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{narrativeCards.filter(c=>(category==="Todos"||category==="Especiales"||category===c.category)&&(c.name+" "+c.description).toLowerCase().includes(search.toLowerCase())).map(c=><button type="button" key={c.id} onClick={()=>add({type:"NARRATIVE",target:"CARD:"+c.id,value:1,description:c.name+": "+c.description})} className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-3 text-left"><b>✦ {c.name}</b><p className="text-xs text-zinc-400">{c.description}</p><span className="text-xs text-cyan-300">{c.pch??5} PCH</span></button>)}{catalog.map(c=><button key={c.type} type="button" onClick={()=>add({type:c.type,target:typeof c.targets[0]==="string"?c.targets[0]:c.targets[0]?.key,value:c.type==="COPY_SKILL"?25:c.type==="STEAL_SKILL"?50:c.type.endsWith("_MULTIPLIER")?100:1,description:"",...(c.type==="COPY_SKILL"?{copyMode:"PERMANENT",copyDurationTurns:3,copyCapacity:5,copyFidelityPercent:100}: {}),...(c.type==="STEAL_SKILL"?{stealDurationTurns:3,stealCapacity:1,stealFidelityPercent:100}: {})})} className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-900 to-cyan-950/30 p-3 text-left hover:border-cyan-400"><b>{c.label}</b><p className="text-xs text-cyan-300">{effectPchCost({type:c.type,value:c.type.endsWith("_MULTIPLIER")?100:1})} PCH base</p></button>)}</div>
  </div>}
  <SharedEffectsEditor className="mt-4" effects={effects} onChange={onChange} onAdd={()=>({type:"STAT_BONUS",target:"STR",value:1} as E)} onTypeChange={(e,type)=>({...e,type,target:targetsFor(type)[0]?.key??""})} hideAdd renderTarget={()=>null} renderCard={(e,i,change,remove)=>{
   if(isComposedSkillEffect(e))return <div className="space-y-3">
     <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-violet-200">Efecto modular · pendiente de revisión</span><button type="button" onClick={remove} className="rounded border border-rose-700/60 px-2 py-1 text-xs text-rose-300">Quitar</button></div>
     <MicroEffectBuilder value={e.module} onChange={module=>change({module} as Partial<E>)}/>
     <label className="block text-xs text-zinc-400">Justificación para quien aprueba (opcional)
       <textarea rows={2} maxLength={1500} value={e.pricingNotes??""} onChange={event=>change({pricingNotes:event.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}/>
     </label>
     {allowReviewModularPch&&<label className="block text-xs text-zinc-300">PCH definitivo asignado al efecto por administración
       <input aria-label="PCH definitivo del efecto modular" type="number" min={1} max={100000} step={1} value={e.reviewedPch??""}
         onChange={event=>change({reviewedPch:event.target.value?Number(event.target.value):undefined} as Partial<E>)} className={"mt-1 w-full "+cls}/>
     </label>}
     <p className="text-xs text-amber-200">{e.reviewedPch===undefined?"Reserva inicial: "+composedEffectBasePch(e)+" PCH · precio provisional, sujeto a revisión":"PCH de este efecto revisado: "+e.reviewedPch+" (antes de ajustes globales de la habilidad)"}</p>
     <p className="text-xs text-zinc-500">Se presenta junto con la habilidad; no funciona en combate antes de contar con un resolutor y aprobación completos.</p>
   </div>;
   const narrative=e.type==="NARRATIVE";const targets=targetsFor(e.type);return <div className="grid gap-2 sm:grid-cols-2">
   <label className="text-xs text-zinc-400">Tipo <SkillFieldHelp field="effectType"/><select value={e.type} onChange={ev=>{const nextType=ev.target.value;const nextTargets=targetsFor(nextType);update(i,{type:nextType,target:nextTargets[0]?.key??""} as Partial<E>);}} className={"mt-1 w-full "+cls}>{!typesForEditor.some(t=>t[0]===e.type)&&<option value={e.type}>{e.type}</option>}{typesForEditor.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}{narrative&&<option value="NARRATIVE">Narrativo</option>}</select></label>
   {narrative?<label className="text-xs text-zinc-400">Descripción<input value={e.description??""} onChange={ev=>update(i,{description:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}/></label>:targets.length>0?<label className="text-xs text-zinc-400">Objetivo <SkillFieldHelp field="effectTarget"/><select value={e.target??""} onChange={ev=>update(i,{target:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}>{e.target&&!targets.some(t=>t.key===e.target)&&<option value={e.target}>{e.target}</option>}{targets.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>:null}
   <ElementSelect value={e.element} onChange={element=>update(i,{element} as Partial<E>)}/>
   <label className="block text-xs text-zinc-400">Capacidad para requisitos
     <select aria-label="Capacidad del efecto para requisitos" value={e.capability??""} onChange={ev=>update(i,{capability:ev.target.value || undefined} as Partial<E>)} className={"mt-1 w-full "+cls}>
       <option value="">Usar el tipo de efecto original</option>
       {e.capability && e.capability!=="CREATE" && !(effectDefinitions??[]).some(def=>def.type===e.capability) && <option value={e.capability}>{e.capability}</option>}
       <option value="CREATE">Crear</option>
       {(effectDefinitions??[]).filter(def=>def.type!=="CREATE").map(def=><option key={def.type} value={def.type}>{def.label}</option>)}
     </select>
     <span className="mt-1 block text-xs text-zinc-500">Se reconoce al verificar requisitos por efecto y elemento.</span>
   </label>
   {!narrative&&<label className="text-xs text-zinc-400">{e.type==="COPY_SKILL"?"Complejidad máxima (PCH)":e.type==="STEAL_SKILL"?"Capacidad de robo (PCH, exige ×2)":"Potencia"} <SkillFieldHelp field="effectPower"/><input type="number" step=".01" value={e.value??0} onChange={ev=>update(i,{value:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/></label>}
   {e.type==="COPY_SKILL" && <div className="col-span-full grid gap-3 rounded-xl border border-violet-800/50 p-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400">Modalidad de copia
        <select value={e.copyMode??"PERMANENT"} onChange={ev=>update(i,{copyMode:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}>
          {COPY_MODES.map(mode=><option key={mode} value={mode}>{({PERMANENT:"Permanente",TEMPORARY:"Temporal",IMITATION:"Imitación",COLLECTION:"Colección"} as Record<string,string>)[mode]}</option>)}
        </select>
      </label>
      <label className="text-xs text-zinc-400">Fidelidad (%)
        <input type="number" min={1} max={100} value={e.copyFidelityPercent??100} onChange={ev=>update(i,{copyFidelityPercent:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>
      {e.copyMode==="TEMPORARY" && <label className="text-xs text-zinc-400">Duración (turnos)
        <input type="number" min={1} max={100} value={e.copyDurationTurns??3} onChange={ev=>update(i,{copyDurationTurns:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>}
      {e.copyMode==="COLLECTION" && <label className="text-xs text-zinc-400">Capacidad de colección
        <input type="number" min={1} max={100} value={e.copyCapacity??5} onChange={ev=>update(i,{copyCapacity:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>}
      <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={e.copyAllowSpecial!==false} onChange={ev=>update(i,{copyAllowSpecial:ev.target.checked} as Partial<E>)}/>Permitir habilidades especiales</label>
      <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={e.copyAllowRacial===true} onChange={ev=>update(i,{copyAllowRacial:ev.target.checked} as Partial<E>)}/>Permitir habilidades raciales</label>
      <p className="col-span-full text-xs text-zinc-500">La complejidad utiliza el PCH de construcción de la habilidad original. Puede aumentarse mediante monedas de mejora.</p>
   </div>}
   {e.type==="STEAL_SKILL" && <div className="col-span-full grid gap-3 rounded-xl border border-rose-800/50 p-3 sm:grid-cols-2">
      <label className="col-span-full flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={e.stealBodyCoercion===true} onChange={ev=>update(i,{stealBodyCoercion:ev.target.checked} as Partial<E>)}/>Coerción corporal directa (la víctima puede defenderse también con CON)</label>
      <p className="col-span-full text-xs text-rose-200">Robar exige el doble de la complejidad PCH de la habilidad original. La víctima pierde temporalmente su uso.</p>
      <label className="text-xs text-zinc-400">Duración del robo (turnos)
        <input type="number" min={1} max={100} value={e.stealDurationTurns??3} onChange={ev=>update(i,{stealDurationTurns:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>
      <label className="text-xs text-zinc-400">Robos simultáneos
        <input type="number" min={1} max={100} value={e.stealCapacity??1} onChange={ev=>update(i,{stealCapacity:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>
      <label className="text-xs text-zinc-400">Fidelidad (%)
        <input type="number" min={1} max={100} value={e.stealFidelityPercent??100} onChange={ev=>update(i,{stealFidelityPercent:Number(ev.target.value)} as Partial<E>)} className={"mt-1 w-full "+cls}/>
      </label>
      <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={e.stealAllowSpecial!==false} onChange={ev=>update(i,{stealAllowSpecial:ev.target.checked} as Partial<E>)}/>Permitir especiales</label>
      <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={e.stealAllowRacial===true} onChange={ev=>update(i,{stealAllowRacial:ev.target.checked} as Partial<E>)}/>Permitir raciales</label>
   </div>}
   <label className="text-xs text-zinc-400">Aplicar a <SkillFieldHelp field="effectRecipient"/><select value={e.targetKind??"SELF"} onChange={ev=>update(i,{targetKind:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}>{[["SELF","A sí mismo"],["CHARACTER","Personaje"],["OPPONENT","Oponente"],["EXISTING_OBJECT","Objeto existente"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   {e.targetKind&&e.targetKind!=="SELF"&&<label className="text-xs text-zinc-400">Referencia <SkillFieldHelp field="effectReference"/><input value={e.targetReference??""} onChange={ev=>update(i,{targetReference:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}/></label>}
   <label className="text-xs text-zinc-400">Condición del efecto (opcional) <SkillFieldHelp field="effectCondition"/><select value={e.activationCondition??"NONE"} onChange={ev=>update(i,{activationCondition:ev.target.value} as Partial<E>)} className={"mt-1 w-full "+cls}>{[["NONE","Sin condición"],["LOW_HEALTH","Vida baja"],["NIGHT_ONLY","Solo de noche"],["ONCE_PER_COMBAT","Una vez por combate"],["THREE_PER_COMBAT","Tres veces por combate"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><span className="mt-1 block text-xs text-zinc-500">Esta condición afecta solo a este efecto; no reemplaza la condición obligatoria de una habilidad pasiva.</span></label>
   <label className="text-xs text-zinc-400">Duración del efecto <SkillFieldHelp field="effectDuration"/><select value={e.durationMovements?"M"+e.durationMovements:String(e.durationTurns??0)} onChange={ev=>{const v=ev.target.value;update(i,{durationMovements:v.startsWith("M")?Number(v.slice(1)):undefined,durationTurns:v.startsWith("M")?undefined:Number(v)} as Partial<E>);}} className={"mt-1 w-full "+cls}><option value="0">Instantáneo</option>{[1,2,3,4,5,10,20].map(n=><option key={"m"+n} value={"M"+n}>{n} movimientos</option>)}{[1,2,3,4,5,10,20].map(n=><option key={n} value={n}>{n} turnos</option>)}</select></label>
   <div className="flex items-center justify-between gap-3"><span className="text-xs text-cyan-300">{e.type.endsWith("_MULTIPLIER")?`×${skillEffectMultiplier(e.type,Number(e.value??0))} · `:""}{priceEffect?priceEffect(e):effectPchCost(e)} PCH</span><button type="button" onClick={()=>onChange(effects.filter((_,j)=>j!==i))} className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300">Quitar</button></div>
  </div>;}}/>
 </section>;
}
