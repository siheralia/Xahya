"use client";
import {ElementSelect} from "@/components/effects/ElementSelect";
import {EffectCard,useEffectElementColors} from "@/components/effects/EffectCard";
import {sharedEffectTypes,sharedEffectTargets} from "@/components/effects/EffectCard";
import type {ReactNode} from "react";

type EffectRow={type:string;element?:string;value?:number};
type Props<E extends EffectRow>={
 effects:E[];onChange:(effects:E[])=>void;
 onAdd:()=>E;onTypeChange:(effect:E,type:string)=>E;
 types?:readonly (readonly [string,string])[];
 renderTarget:(effect:E,index:number,update:(patch:Partial<E>)=>void)=>ReactNode;
 renderExtra?:(effect:E,index:number,update:(patch:Partial<E>)=>void)=>ReactNode;
 className?:string;
 renderCard?:(effect:E,index:number,update:(patch:Partial<E>)=>void,remove:()=>void)=>ReactNode;
 header?:ReactNode;
 hideAdd?:boolean;
};
const inputClass="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
export function SharedEffectsEditor<E extends EffectRow>({effects,onChange,onAdd,onTypeChange,types,renderTarget,renderExtra,className,renderCard,header,hideAdd}:Props<E>){
 const colors=useEffectElementColors();
 const options=types??sharedEffectTypes.map(e=>[e.type,e.label] as const);
 const update=(i:number,patch:Partial<E>)=>onChange(effects.map((e,j)=>i===j?{...e,...patch}:e));
 return <section className={className??"rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"}>
  <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Efectos</h3>{header}{!hideAdd&&<button type="button" onClick={()=>onChange([...effects,onAdd()])} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">+ Añadir efecto</button>}</div>
  <div className="mt-3 space-y-3">{effects.map((effect,i)=><EffectCard key={i} element={effect.element} colors={colors}>{renderCard ? renderCard(effect,i,patch=>update(i,patch),()=>onChange(effects.filter((_,j)=>i!==j))) : <>
   <div className="grid gap-3 sm:grid-cols-2">
    <ElementSelect value={effect.element} onChange={element=>update(i,{element} as Partial<E>)}/>
    <label className="text-xs text-zinc-400">Tipo<select className={`mt-1 w-full ${inputClass}`} value={effect.type} onChange={e=>onChange(effects.map((row,j)=>j===i?onTypeChange(row,e.target.value):row))}>{!options.some(([type])=>type===effect.type)&&<option value={effect.type}>{effect.type}</option>}{options.map(([type,label])=><option key={type} value={type}>{label}</option>)}</select></label>
    {renderTarget(effect,i,patch=>update(i,patch))}
    <label className="text-xs text-zinc-400">Valor<input type="number" step="any" value={effect.value??0} onChange={e=>update(i,{value:Number(e.target.value)} as Partial<E>)} className={`mt-1 w-full ${inputClass}`}/></label>
   </div>
   {renderExtra?.(effect,i,patch=>update(i,patch))}
   <button type="button" onClick={()=>onChange(effects.filter((_,j)=>i!==j))} className="mt-3 rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300">Quitar efecto</button></>}
  </EffectCard>)}{effects.length===0&&<p className="text-sm text-zinc-500">Sin efectos.</p>}</div>
 </section>;
}
export {sharedEffectTargets};
