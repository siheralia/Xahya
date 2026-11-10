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
import {quoteSkillPchBudget} from "@/lib/skills/pch-budget-feedback";

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
  pch?: { total:number; base:number; manaAdjusted:number; beforeRequirements:number; balance?:number; baseline?:number; genericSpecialization?:boolean; originalTotal?:number; provisional?:boolean };
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
  const budget=pch?quoteSkillPchBudget(pch):null;
  const editDelta=pch && pch.originalTotal!==undefined ? pch.total-pch.originalTotal : null;
  const editDifference=(value:number)=>value>0?"+"+value:value<0?"−"+Math.abs(value):"0";
  return <div className="xahya-modal-overlay flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="xahya-modal-panel max-h-[90dvh] min-w-0 w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950 p-4 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{title}</h2>{description&&<p className="mt-1 text-sm text-zinc-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button></div>
      {pch&&<div className="sticky top-0 z-20 -mx-2 mt-4 flex min-w-0 flex-col gap-2 border-b border-zinc-800 bg-zinc-950/95 px-2 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1 text-xs text-zinc-300">
          <p>{budget?.baseline!==null&&budget?.baseline!==undefined
            ?"Una moneda de mejora aporta 5 PCH y habilita una solicitud de mejora; solo pagas el incremento."
            :"Una moneda de creación aporta 10 PCH. Puedes acumular saldo para habilidades más caras."}</p>
          {budget&&<p className="font-semibold text-cyan-200">
            {budget.baseline!==null?"Incremento a pagar: ":"A reservar: "}{budget.payable} PCH
            {budget.balance!==null?" · Saldo: "+budget.balance+" PCH":""}
            {budget.remaining!==null?" · Después: "+budget.remaining+" PCH":""}
          </p>}
          {budget?.affordable===false&&<p role="alert" className="font-semibold text-amber-300">
            Faltan {budget.shortfall} PCH. Puedes reunir más PCH o reducir el costo.
          </p>}
          {budget?.requiresIncreasedPrice&&<p role="alert" className="font-semibold text-amber-300">
            Una mejora debe aumentar el costo PCH total de la habilidad.
          </p>}
          {pch.provisional&&<p className="text-amber-200">Reserva provisional: administración confirmará el PCH definitivo; podría variar.</p>}
        </div>
        <button type="button" onClick={()=>setBreakdownOpen(true)}
          className="w-full min-w-0 shrink-0 whitespace-normal break-words rounded-xl border border-cyan-400 bg-cyan-950 px-3 py-2 text-center text-sm font-bold text-cyan-100 shadow-lg shadow-black/50 sm:w-auto">
          {pch.baseline===undefined?"Costo: "+pch.total+" PCH":pch.genericSpecialization?"Costo total: "+pch.total+" · Especialización: "+Math.max(0,pch.total-pch.baseline)+" PCH":"Costo total: "+pch.total+" · Mejora: "+Math.max(0,pch.total-pch.baseline)+" PCH"}
          {editDelta!==null?" · Δ original: "+editDifference(editDelta)+" PCH":""} · Detalles
        </button>
      </div>}
      <div className="mt-5 space-y-5"><SkillCreationGuide form={form}/>{characterSelector}<SkillCoreFields form={form} onChange={onChange} effectEditor={<SkillEffectsEditor effects={form.effect} onChange={effect=>onChange({...form,effect})} statistics={statistics} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions} priceEffect={priceEffect} allowReviewModularPch={allowReviewModularPch} enableModularEffects={enableModularEffects} />}/>
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
      {pch&&breakdownOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBreakdownOpen(false);}}><div role="dialog" aria-modal="true" aria-label="Desglose de PCH" className="max-h-[85dvh] w-full max-w-sm min-w-0 overflow-y-auto rounded-2xl border border-cyan-500/50 bg-zinc-950 p-4 text-sm text-zinc-200 shadow-2xl sm:p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-cyan-200">Costo: {pch.total} PCH</h3><button type="button" onClick={()=>setBreakdownOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2">Cerrar</button></div><div className="mt-4 space-y-2"><p>Efectos: {pch.base} PCH</p><p>Tras ajuste por maná ({form.cost}): {pch.manaAdjusted} PCH</p><p>Velocidad: {speedCost} PCH</p><p>Tiempo de espera ({form.cooldown==="Sin cooldown"?"Sin tiempo de espera":form.cooldown||"Sin tiempo de espera"}): −{cooldownSaved} PCH ({cooldownPercent}%)</p><p>Distancia ({form.maxRangeMeters??5} m): {distance>0?"+":""}{distance} PCH (mínimo total 1)</p>{budget&&budget.balance!==null&&<p>Saldo: {budget.balance} PCH · A pagar: {budget.payable} PCH · Restante: {budget.remaining} PCH</p>}<p>Subtotal antes de requisitos: {pch.beforeRequirements} PCH</p>
        {"effectRequirements" in form && Array.isArray(form.effectRequirements) && <p className="font-semibold text-cyan-200">
          Requisitos ({effectRequirementDiscountPercent(form.effectRequirements as EffectRequirement[])} %):
          {" "}-{afterCooldown-pch.total} PCH
        </p>}
        <p className="font-semibold">Total de la habilidad: {pch.total} PCH</p>{budget&&<p>Una moneda aporta {budget.referenceCoinPch} PCH. {budget.payable<=budget.referenceCoinPch?"Esta operación cabe en el valor de una moneda.":"La operación necesita PCH acumulados de más de una moneda."}</p>}{pch.provisional&&<p className="text-amber-200">El total es una reserva provisional, no el precio de aprobación.</p>}
        {editDelta!==null&&<div className="space-y-1 rounded-lg border border-zinc-700 px-3 py-2">
          <p>Precio original al abrir: <strong>{pch.originalTotal} PCH</strong></p>
          <p className={editDelta>0?"font-semibold text-amber-300":editDelta<0?"font-semibold text-emerald-300":"font-semibold text-zinc-300"}>Diferencia: {editDifference(editDelta)} PCH{editDelta===0?" (sin cambios)":editDelta>0?" (aumenta)":" (disminuye)"}</p>
        </div>}{pch.baseline!==undefined&&<p className="font-semibold text-violet-200">{pch.genericSpecialization?"Costo de la especialización: ":"Costo adicional de mejora: "}{Math.max(0,pch.total-pch.baseline)} PCH{pch.genericSpecialization?" (sin pagar otra vez la habilidad base)":" + 1 moneda de mejora"}</p>}
        <p className="text-xs text-zinc-500">Los requisitos reducen el costo de creación y se comprueban al activar la habilidad.</p></div></div></div>}
    </div>
  </div>;
}
