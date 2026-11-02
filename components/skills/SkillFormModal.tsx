"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EffectRequirementsField } from "./EffectRequirementsField";
import { SkillMechanicsEditor } from "./SkillMechanicsEditor";
import { effectRequirementDiscountPercent, type EffectRequirement } from "@/lib/skills/effect-requirements";
import type { AvailableSkill } from "./SkillPrerequisitesField";
import { SkillCoreFields, type SkillCore } from "./SkillCoreFields";
import { SkillEffectsEditor, type EditableEffect, type NarrativeCard } from "./SkillEffectsEditor";
import { isPassiveConditionMissing, PASSIVE_CONDITION_REQUIRED_MESSAGE } from "@/lib/skills/passive-condition";
import {applyCooldownPch,cooldownDiscountPercent} from "@/lib/skills/cooldown";

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
  availableSkills?: AvailableSkill[];
  characterId?: number;
  editingSkillId?: number | null;
  actions: ReactNode;
  pch?: { total:number; base:number; manaAdjusted:number; beforeRequirements:number; balance?:number; baseline?:number; genericSpecialization?:boolean; originalTotal?:number };
};

export function SkillFormModal<T extends SkillCore, E extends EditableEffect>({
  open,title,description,onClose,form,onChange,statistics,narrativeCards,effectDefinitions,priceEffect,characterSelector,availableSkills,characterId,editingSkillId,actions,pch
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
  const passiveConditionMissing=isPassiveConditionMissing(form.category,form.condition);
  const speedCost=!form.speed||form.speed==="DEFAULT"?0:5;
  const distance=Number(form.maxRangeMeters??5)-5;
  const afterCooldown=pch?applyCooldownPch(pch.beforeRequirements,form.cooldown,form.duration,form.category):0;
  const cooldownSaved=pch?pch.beforeRequirements-afterCooldown:0;
  const cooldownPercent=cooldownDiscountPercent(form.cooldown,form.duration,form.category);
  const editDelta=pch && pch.originalTotal!==undefined ? pch.total-pch.originalTotal : null;
  const editDifference=(value:number)=>value>0?"+"+value:value<0?"−"+Math.abs(value):"0";
  return <div className="xahya-modal-overlay flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="xahya-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950 p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{title}</h2>{description&&<p className="mt-1 text-sm text-zinc-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button></div>
      {passiveConditionMissing&&<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
        <span>{PASSIVE_CONDITION_REQUIRED_MESSAGE}</span>
        <button type="button" onClick={()=>document.getElementById("skill-passive-condition")?.focus()} className="rounded border border-amber-400/70 px-3 py-1.5 font-semibold hover:bg-amber-900/40">Ir a condición</button>
      </div>}
      {pch&&<div className="sticky top-0 z-20 -mx-2 mt-4 flex justify-end bg-zinc-950/95 px-2 py-3 backdrop-blur"><button type="button" onClick={()=>setBreakdownOpen(true)} className="rounded-full border border-cyan-400 bg-cyan-950 px-4 py-2 text-sm font-bold text-cyan-100 shadow-lg shadow-black/50">{pch.baseline===undefined?"Costo: "+pch.total+" PCH":pch.genericSpecialization?"Costo total: "+pch.total+" · Especialización: "+Math.max(0,pch.total-pch.baseline)+" PCH":"Costo total: "+pch.total+" · Mejora: "+Math.max(0,pch.total-pch.baseline)+" PCH"}{editDelta!==null?" · Δ original: "+editDifference(editDelta)+" PCH":""} · Detalles</button></div>}
      <div className="mt-5 space-y-5">{characterSelector}<SkillCoreFields form={form} onChange={onChange} effectEditor={<SkillEffectsEditor effects={form.effect} onChange={effect=>onChange({...form,effect})} statistics={statistics} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions} priceEffect={priceEffect} />}/><SkillMechanicsEditor value={form.mechanics??{}} onChange={mechanics=>onChange({...form,mechanics})} characterId={characterId} availableSkills={availableSkills} editingSkillId={editingSkillId}/>
      {"effectRequirements" in form && Array.isArray(form.effectRequirements) && <EffectRequirementsField value={form.effectRequirements as EffectRequirement[]} onChange={requirements=>onChange({...form,effectRequirements:requirements})} effects={(effectDefinitions??[]).map(e=>({type:e.type,label:e.label}))} />}{actions}</div>
      {pch&&breakdownOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBreakdownOpen(false);}}><div role="dialog" aria-modal="true" aria-label="Desglose de PCH" className="w-full max-w-sm rounded-2xl border border-cyan-500/50 bg-zinc-950 p-5 text-sm text-zinc-200 shadow-2xl"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-cyan-200">Costo: {pch.total} PCH</h3><button type="button" onClick={()=>setBreakdownOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2">Cerrar</button></div><div className="mt-4 space-y-2"><p>Efectos: {pch.base} PCH</p><p>Tras ajuste por maná ({form.cost}): {pch.manaAdjusted} PCH</p><p>Velocidad: {speedCost} PCH</p><p>Cooldown ({form.cooldown||"Sin cooldown"}): −{cooldownSaved} PCH ({cooldownPercent}%)</p><p>Distancia ({form.maxRangeMeters??5} m): {distance>0?"+":""}{distance} PCH (mínimo total 1)</p>{pch.balance!==undefined&&<p>Saldo: {pch.balance} PCH · Restante: {pch.balance-pch.total} PCH</p>}<p>Subtotal antes de requisitos: {pch.beforeRequirements} PCH</p>
        {"effectRequirements" in form && Array.isArray(form.effectRequirements) && <p className="font-semibold text-cyan-200">
          Requisitos ({effectRequirementDiscountPercent(form.effectRequirements as EffectRequirement[])} %):
          {" "}-{afterCooldown-pch.total} PCH
        </p>}
        <p className="font-semibold">Total: {pch.total} PCH</p>
        {editDelta!==null&&<div className="space-y-1 rounded-lg border border-zinc-700 px-3 py-2">
          <p>Precio original al abrir: <strong>{pch.originalTotal} PCH</strong></p>
          <p className={editDelta>0?"font-semibold text-amber-300":editDelta<0?"font-semibold text-emerald-300":"font-semibold text-zinc-300"}>Diferencia: {editDifference(editDelta)} PCH{editDelta===0?" (sin cambios)":editDelta>0?" (aumenta)":" (disminuye)"}</p>
        </div>}{pch.baseline!==undefined&&<p className="font-semibold text-violet-200">{pch.genericSpecialization?"Costo de la especialización: ":"Costo adicional de mejora: "}{Math.max(0,pch.total-pch.baseline)} PCH{pch.genericSpecialization?" (sin pagar otra vez la habilidad base)":" + 1 moneda de mejora"}</p>}
        <p className="text-xs text-zinc-500">Los requisitos reducen el costo de creación y se comprueban al activar la habilidad.</p></div></div></div>}
    </div>
  </div>;
}
