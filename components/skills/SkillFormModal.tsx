"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EffectRequirementsField } from "./EffectRequirementsField";
import { SkillMechanicsEditor } from "./SkillMechanicsEditor";
import { effectRequirementDiscountPercent, type EffectRequirement } from "@/lib/skills/effect-requirements";
import type { AvailableSkill } from "./SkillPrerequisitesField";
import { SkillCoreFields, type SkillCore } from "./SkillCoreFields";
import { SkillEffectsEditor, type EditableEffect, type NarrativeCard } from "./SkillEffectsEditor";
import { SkillCreationGuide } from "./SkillCreationGuide";
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
  allowReviewModularPch?:boolean;
  enableModularEffects?:boolean;
  characterSelector?: ReactNode;
  availableSkills?: AvailableSkill[];
  characterId?: number;
  editingSkillId?: number | null;
  actions: ReactNode;
  pch?: { total:number; base:number; manaAdjusted:number; beforeRequirements:number; balance?:number; baseline?:number; genericSpecialization?:boolean; originalTotal?:number };
};

export function SkillFormModal<T extends SkillCore, E extends EditableEffect>({
  open,title,description,onClose,form,onChange,statistics,narrativeCards,effectDefinitions,priceEffect,allowReviewModularPch,enableModularEffects,characterSelector,availableSkills,characterId,editingSkillId,actions,pch
}:Props<T,E>) {
  const [breakdownOpen,setBreakdownOpen]=useState(false);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const hasMechanics=Object.keys(form.mechanics??{}).length>0;
    const requirements="effectRequirements" in form && Array.isArray(form.effectRequirements)
      && form.effectRequirements.length>0;
    setAdvancedOpen(hasMechanics||requirements);
  // Solo al abrir el formulario: no cerrar la sección durante la edición.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);
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
  const afterCooldown=pch?applyCooldownPch(pch.beforeRequirements,form.cooldown,form.duration,form.category):0;
  const cooldownSaved=pch?pch.beforeRequirements-afterCooldown:0;
  const cooldownPercent=cooldownDiscountPercent(form.cooldown,form.duration,form.category);
  const editDelta=pch && pch.originalTotal!==undefined ? pch.total-pch.originalTotal : null;
  // One creation coin grants 10 PCH, but the spendable budget is the actual
  // character balance, not a fixed ten-point cap. Upgrades only reserve delta.
  const payablePch=pch?(pch.baseline===undefined?pch.total:Math.max(0,pch.total-pch.baseline)):0;
  const missingPch=pch?.balance===undefined?0:Math.max(0,payablePch-pch.balance);
  const hasModularEffects=form.effect.some(effect=>effect.type==="COMPOSED");
  const editDifference=(value:number)=>value>0?"+"+value:value<0?"−"+Math.abs(value):"0";
  return <div className="xahya-modal-overlay flex items-center justify-center bg-black/75 p-2 sm:p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="xahya-modal-panel max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-4xl overflow-x-hidden overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950 p-3 shadow-2xl sm:max-h-[90vh] sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-bold sm:text-2xl">{title}</h2>{description&&<p className="mt-1 text-sm text-zinc-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button></div>
      {pch&&<div className="sticky top-0 z-20 -mx-1 mt-4 flex min-w-0 flex-col gap-2 bg-zinc-950/95 px-1 py-3 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"><button type="button" onClick={()=>setBreakdownOpen(true)} className="w-full min-w-0 max-w-full whitespace-normal break-words rounded-xl border border-cyan-400 bg-cyan-950 px-3 py-2 text-left text-sm font-bold text-cyan-100 shadow-lg shadow-black/50 sm:w-auto sm:rounded-full">{pch.baseline===undefined?"Costo: "+pch.total+" PCH":pch.genericSpecialization?"Costo total: "+pch.total+" · Especialización: "+Math.max(0,pch.total-pch.baseline)+" PCH":"Costo total: "+pch.total+" · Mejora: "+Math.max(0,pch.total-pch.baseline)+" PCH"}{editDelta!==null?" · Δ original: "+editDifference(editDelta)+" PCH":""} · Detalles</button>
        {pch.balance!==undefined&&<div role="status" aria-live="polite" className={"min-w-0 rounded-lg border px-3 py-2 text-xs "+(missingPch>0
           ?"border-rose-700/60 bg-rose-950/30 text-rose-200"
           :"border-emerald-700/40 bg-emerald-950/20 text-emerald-200")}>
          <strong>Reserva: {payablePch} PCH</strong> · Saldo: {pch.balance} PCH · {missingPch>0
            ?"Te faltan "+missingPch+" PCH"
            :"Te quedarán "+(pch.balance-payablePch)+" PCH"}
        </div>}
      </div>}
      {pch?.balance!==undefined&&<p className="mt-1 text-xs text-zinc-400">
        Cada moneda de creación aporta 10 PCH; el saldo se acumula, no hay un límite fijo de 10 por habilidad.
        {hasModularEffects?" La reserva de módulos es provisional hasta la revisión administrativa.":""}
      </p>}
      <div className="mt-5 min-w-0 space-y-5"><SkillCreationGuide form={form}/>{characterSelector}<SkillCoreFields form={form} onChange={onChange} effectEditor={<SkillEffectsEditor effects={form.effect} onChange={effect=>onChange({...form,effect})} statistics={statistics} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions} priceEffect={priceEffect} allowReviewModularPch={allowReviewModularPch} enableModularEffects={enableModularEffects} />}/>
      <section className="space-y-3 rounded-xl border border-zinc-800 p-3">
        <button type="button" aria-expanded={advancedOpen} onClick={()=>setAdvancedOpen(v=>!v)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-zinc-200">
          <span>Configuración avanzada: mecánicas y requisitos (opcional)</span>
          <span aria-hidden="true">{advancedOpen?"−":"+"}</span>
        </button>
        {!advancedOpen&&<p className="text-xs text-zinc-400">Para crear tu primera habilidad puedes dejar esto cerrado.</p>}
        {advancedOpen&&<div className="space-y-4">
          <SkillMechanicsEditor value={form.mechanics??{}} onChange={mechanics=>onChange({...form,mechanics})}
            characterId={characterId} availableSkills={availableSkills} editingSkillId={editingSkillId} statistics={statistics}/>
          {"effectRequirements" in form && Array.isArray(form.effectRequirements) &&
            <EffectRequirementsField value={form.effectRequirements as EffectRequirement[]}
              onChange={requirements=>onChange({...form,effectRequirements:requirements})}
              effects={(effectDefinitions??[]).map(e=>({type:e.type,label:e.label}))}/>}
        </div>}
      </section>
      {actions}</div>
      {pch&&breakdownOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBreakdownOpen(false);}}><div role="dialog" aria-modal="true" aria-label="Desglose de PCH" className="max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-sm overflow-x-hidden overflow-y-auto rounded-2xl border border-cyan-500/50 bg-zinc-950 p-3 text-sm text-zinc-200 shadow-2xl sm:p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-cyan-200">Costo: {pch.total} PCH</h3><button type="button" onClick={()=>setBreakdownOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2">Cerrar</button></div><div className="mt-4 space-y-2"><p>Efectos: {pch.base} PCH</p><p>Tras ajuste por maná ({form.cost}): {pch.manaAdjusted} PCH</p><p>Velocidad: {speedCost} PCH</p><p>Tiempo de espera ({form.cooldown==="Sin cooldown"?"Sin tiempo de espera":form.cooldown||"Sin tiempo de espera"}): −{cooldownSaved} PCH ({cooldownPercent}%)</p><p>Distancia ({form.maxRangeMeters??5} m): {distance>0?"+":""}{distance} PCH (mínimo total 1)</p>{pch.balance!==undefined&&<p>Saldo: {pch.balance} PCH · A reservar: {payablePch} PCH · Restante: {pch.balance-payablePch} PCH</p>}<p>Subtotal antes de requisitos: {pch.beforeRequirements} PCH</p>
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
