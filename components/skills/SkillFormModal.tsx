"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SkillCoreFields, type SkillCore } from "./SkillCoreFields";
import { SkillEffectsEditor, type EditableEffect, type NarrativeCard } from "./SkillEffectsEditor";

type Props<T extends SkillCore, E extends EditableEffect> = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  form: T & { effect: E[] };
  onChange: (next: T & { effect: E[] }) => void;
  statistics?: {key:string;name:string;kind:"basic"|"derived";active?:boolean}[];
  narrativeCards?: NarrativeCard[];
  effectDefinitions?: {type:string;label:string;targets:{key:string;label:string}[]}[];
  priceEffect?: (effect:E)=>number;
  characterSelector?: ReactNode;
  actions: ReactNode;
  pch?: { total:number; base:number; manaAdjusted:number; balance?:number };
};

export function SkillFormModal<T extends SkillCore, E extends EditableEffect>({
  open,title,description,onClose,form,onChange,statistics,narrativeCards,effectDefinitions,priceEffect,characterSelector,actions,pch
}:Props<T,E>) {
  const [breakdownOpen,setBreakdownOpen]=useState(false);
  useEffect(()=>{
    if (!open) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){if(breakdownOpen)setBreakdownOpen(false);else onClose();}};
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);};
  },[open,onClose,breakdownOpen]);
  if (!open) return null;
  const speedCost=!form.speed||form.speed==="DEFAULT"?0:5;
  const distance=Number(form.maxRangeMeters??5)-5;
  return <div className="xahya-modal-overlay flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="xahya-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950 p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{title}</h2>{description&&<p className="mt-1 text-sm text-zinc-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button></div>
      {pch&&<div className="sticky top-0 z-20 -mx-2 mt-4 flex justify-end bg-zinc-950/95 px-2 py-3 backdrop-blur"><button type="button" onClick={()=>setBreakdownOpen(true)} className="rounded-full border border-cyan-400 bg-cyan-950 px-4 py-2 text-sm font-bold text-cyan-100 shadow-lg shadow-black/50">Costo: {pch.total} PCH · Detalles</button></div>}
      <div className="mt-5 space-y-5">{characterSelector}<SkillCoreFields form={form} onChange={onChange} effectEditor={<SkillEffectsEditor effects={form.effect} onChange={effect=>onChange({...form,effect})} statistics={statistics} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions} priceEffect={priceEffect} />}/>{actions}</div>
      {pch&&breakdownOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBreakdownOpen(false);}}><div role="dialog" aria-modal="true" aria-label="Desglose de PCH" className="w-full max-w-sm rounded-2xl border border-cyan-500/50 bg-zinc-950 p-5 text-sm text-zinc-200 shadow-2xl"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-cyan-200">Costo: {pch.total} PCH</h3><button type="button" onClick={()=>setBreakdownOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2">Cerrar</button></div><div className="mt-4 space-y-2"><p>Efectos: {pch.base} PCH</p><p>Tras ajuste por maná ({form.cost}): {pch.manaAdjusted} PCH</p><p>Velocidad: {speedCost} PCH</p><p>Distancia ({form.maxRangeMeters??5} m): {distance>0?"+":""}{distance} PCH (mínimo total 1)</p>{pch.balance!==undefined&&<p>Saldo: {pch.balance} PCH · Restante: {pch.balance-pch.total} PCH</p>}<p className="text-xs text-zinc-500">No se aplican descuentos por condiciones no verificables en combate.</p></div></div></div>}
    </div>
  </div>;
}
