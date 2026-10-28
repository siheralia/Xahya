"use client";
import { useMemo, useState } from "react";
import { EFFECT_CATALOG } from "@/lib/effects/catalog";
import { effectPchCost } from "@/lib/skills/pch";

export type PickedSkillEffect = {type:string;target?:string;value?:number;description?:string};
export function SkillEffectPicker({onPick}:{onPick:(effect:PickedSkillEffect)=>void}) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const options=useMemo(()=>EFFECT_CATALOG.filter(effect=>effect.type!=="MAZE_UTILITY" && (effect.label+" "+effect.type).toLowerCase().includes(search.toLowerCase())),[search]);
  return <div className="mt-3">
    <button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200">+ Buscar efecto</button>
    {open && <div className="mt-3 rounded-xl border border-cyan-800/60 bg-zinc-950 p-3">
      <input aria-label="Buscar efectos" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar efecto por nombre…" className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"/>
      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{options.map(effect=><button key={effect.type} type="button" onClick={()=>{onPick({type:effect.type,target:effect.targets[0],value:effect.type.endsWith("_MULTIPLIER")?100:1,description:""});setOpen(false);setSearch("");}} className="rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-900 to-cyan-950/30 p-4 text-left hover:border-cyan-400"><span className="block font-semibold">{effect.label}</span><span className="mt-2 block text-xs text-cyan-300">{effectPchCost({type:effect.type,value:effect.type.endsWith("_MULTIPLIER")?100:1})} PCH base</span></button>)}</div>
      {!options.length && <p className="text-sm text-zinc-500">No hay efectos con ese nombre.</p>}
    </div>}
  </div>;
}
