"use client";
import type { EffectRequirement } from "@/lib/skills/effect-requirements";
export function EffectRequirementsField({value,onChange,effects}:{value:EffectRequirement[];onChange:(v:EffectRequirement[])=>void;effects:{type:string;label:string}[]}) {
 const options = [...new Map([...effects,{type:"CREATE",label:"Crear"}].map(e=>[e.type,e])).values()];
 const elements = ["","NEUTRAL","FIRE","WATER","EARTH","AIR","LIGHT","DARK","ICE","LIGHTNING"];
 return <fieldset className="rounded-xl border border-zinc-700 p-4 space-y-3"><legend className="px-2 font-semibold text-sm">Requisitos por efecto</legend>
 <p className="text-xs text-zinc-400">Una habilidad aprobada con el efecto basta. Si eliges elemento, debe coincidir también. Descuento: 10% por efecto, 20% por efecto y elemento, máximo 50%.</p>
 {value.map((r,i)=><div key={i} className="flex flex-wrap gap-2 items-center"><select aria-label="Efecto requerido" value={r.effect} onChange={e=>onChange(value.map((v,j)=>i===j?{...v,effect:e.target.value}:v))} className="bg-zinc-950 border border-zinc-700 rounded p-2">{!options.some(o=>o.type===r.effect)&&<option value={r.effect}>{r.effect}</option>}{options.map(o=><option key={o.type} value={o.type}>{o.label}</option>)}</select><select aria-label="Elemento requerido" value={r.element??""} onChange={e=>onChange(value.map((v,j)=>i===j?{...v,element:e.target.value}:v))} className="bg-zinc-950 border border-zinc-700 rounded p-2">{elements.map(el=><option key={el} value={el}>{el||"Cualquier elemento"}</option>)}</select><button type="button" onClick={()=>onChange(value.filter((_,j)=>j!==i))} className="border border-zinc-700 rounded px-3 py-2">Quitar</button></div>)}
 <button type="button" disabled={value.length>=10} onClick={()=>onChange([...value,{effect:options[0]?.type??"CREATE",element:""}])} className="border border-cyan-700 rounded px-3 py-2 disabled:opacity-40">Añadir requisito</button></fieldset>;
}
