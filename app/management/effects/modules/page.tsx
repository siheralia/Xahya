"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {MicroEffectBuilder,freshMicroEffect} from "@/components/effects/MicroEffectBuilder";
import {validateEffectContainers,type EffectContainer} from "@/lib/effects/micro-modules";
import type {MicroEffectTemplate} from "@/lib/effects/micro-template-registry";
import {GLORIA_MICRO_PRESETS} from "@/lib/effects/micro-template-presets";

type Draft={effect:EffectContainer;proposedPch:number|null;pricingNotes:string;sourceTemplateId:string|null};
const fresh=():Draft=>({effect:freshMicroEffect(),proposedPch:null,pricingNotes:"",sourceTemplateId:null});
const field="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100";
const statuses:Record<MicroEffectTemplate["status"],string>={
  DRAFT:"Borrador",PENDING:"Pendiente de revisión",APPROVED:"Plantilla aprobada",REJECTED:"Devuelta para cambios",
};
export default function MicroEffectManagementPage(){
  const [templates,setTemplates]=useState<MicroEffectTemplate[]>([]);
  const [selected,setSelected]=useState<MicroEffectTemplate|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [reviewedPch,setReviewedPch]=useState<number>(1);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    const r=await fetch("/api/management/effect-modules",{cache:"no-store"});
    const data=await r.json();
    if(!r.ok)throw Error(data.error??"No se pudo cargar el catálogo modular.");
    setTemplates(data.templates??[]);
  },[]);
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Error al cargar")).finally(()=>setLoading(false));},[load]);
  const show=(t:MicroEffectTemplate)=>{
    setSelected(t);
    setDraft({effect:structuredClone(t.effect),proposedPch:t.proposedPch,pricingNotes:t.pricingNotes,sourceTemplateId:t.sourceTemplateId});
    setReviewedPch(t.reviewedPch??t.proposedPch??1);
    setError("");setMessage("");
  };
  const create=()=>{setSelected(null);setDraft(fresh());setReviewedPch(1);setError("");setMessage("");};
  const choosePreset=(index:number)=>{const preset=GLORIA_MICRO_PRESETS[index];if(!preset)return;
    const effect=structuredClone(preset.effect);effect.id=freshMicroEffect().id;
    setSelected(null);setDraft({effect,proposedPch:null,pricingNotes:"Ejemplo de Gloria; valorar PCH antes de aprobar.",sourceTemplateId:null});
    setError("");setMessage("Ejemplo cargado como borrador; no se ha guardado ni activado.");};
  // Links from the gallery open the selected Gloria preset directly in the
  // editable builder; loading it does not save, approve or charge anything.
  useEffect(()=>{
    const presetKey=new URLSearchParams(window.location.search).get("preset");
    if(presetKey===null||!/^[0-4]$/.test(presetKey))return;
    const preset=GLORIA_MICRO_PRESETS[Number(presetKey)];
    if(!preset)return;
    const effect=structuredClone(preset.effect);
    effect.id=freshMicroEffect().id;
    setSelected(null);
    setDraft({effect,proposedPch:null,
      pricingNotes:"Ejemplo de Gloria; valorar PCH antes de aprobar.",sourceTemplateId:null});
    setMessage("Ejemplo de Gloria listo para editar. No está guardado ni aprobado.");
  },[]);
  const clone=()=>{
    if(!draft||!selected)return;
    const original=selected.id;
    setDraft({...draft,effect:{...draft.effect,id:freshMicroEffect().id},sourceTemplateId:original});
    setSelected(null);setError("");setMessage("Copia preparada como borrador independiente.");
  };
  async function persist(action:"CREATE"|"SAVE"|"SUBMIT"|"APPROVE"|"REJECT"){
    if(!draft)return;
    setError("");setMessage("");
    if(["CREATE","SAVE","SUBMIT"].includes(action)){
      const problem=validateEffectContainers([draft.effect]);
      if(problem){setError(problem);return;}
    }
    setSaving(true);
    try{
      const method=action==="CREATE"?"POST":"PATCH";
      const payload=action==="CREATE"?draft:{
        id:selected?.id,expectedRevision:selected?.revision,action,
        ...(action==="APPROVE"?{reviewedPch}:action==="REJECT"?{}:draft)
      };
      const r=await fetch("/api/management/effect-modules",{
        method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      const data=await r.json();
      if(!r.ok)throw Error(data.error??"No se pudo guardar.");
      await load();
      show(data.template);
      setMessage(action==="APPROVE"?"Plantilla aprobada para el catálogo (aún no ejecutable).":
        action==="SUBMIT"?"Enviada a revisión.":action==="REJECT"?"Devuelta para cambios.":"Borrador guardado.");
    }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}
    finally{setSaving(false);}
  }
  const locked=selected?.status==="APPROVED"||selected?.status==="PENDING";
  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 text-white">
    <Link href="/management/effects" className="text-sm text-cyan-300 hover:underline">← Gestión de efectos</Link>
    <header className="space-y-2"><h1 className="text-2xl font-bold">Constructor de efectos modulares</h1>
      <p className="max-w-4xl text-sm text-zinc-400">Compón efectos con requisitos, condiciones, referencias, acumuladores y operaciones. Las plantillas se guardan como borradores y pasan por revisión antes de incorporarse al catálogo modular.</p>
      <p className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-xs text-amber-200">La aprobación aquí es editorial. No activa automáticamente la plantilla en habilidades, combate o compras PCH. La valoración PCH es provisional y manual hasta completar la investigación de costos.</p>
    </header>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-400">Ejemplos:</span>
      {GLORIA_MICRO_PRESETS.map((preset,i)=><button type="button" key={preset.label} onClick={()=>choosePreset(i)} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-cyan-500">{preset.label}</button>)}
    </div>
    {error&&<p role="alert" className="rounded border border-red-700 p-3 text-sm text-red-300">{error}</p>}
    {message&&<p role="status" className="text-sm text-cyan-300">{message}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(230px,300px)_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Plantillas</h2>
          <button type="button" onClick={create} className="rounded-lg border border-cyan-600 px-2 py-1 text-sm">+ Nueva</button>
        </div>
        {loading&&<p className="text-sm text-zinc-500">Cargando…</p>}
        {!loading&&templates.length===0&&<p className="text-xs text-zinc-500">Aún no hay plantillas guardadas.</p>}
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {templates.map(t=><button type="button" key={t.id} onClick={()=>show(t)}
            aria-pressed={selected?.id===t.id}
            className={"w-full rounded-lg border p-3 text-left text-sm "+(selected?.id===t.id?"border-cyan-500 bg-cyan-950/30":"border-zinc-700 bg-zinc-950")}>
            <strong className="block truncate">{t.effect.name}</strong>
            <span className="text-xs text-zinc-400">{statuses[t.status]} · r{t.revision}</span>
            <span className="block text-xs text-zinc-500">{t.reviewedPch===null?"PCH sin aprobar":t.reviewedPch+" PCH provisional"}</span>
          </button>)}
        </div>
      </aside>
      <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
        {!draft?<div className="space-y-3 text-sm text-zinc-400"><p>Selecciona una plantilla o crea una nueva.</p><button type="button" onClick={create} className="rounded-lg bg-cyan-800 px-4 py-2 text-white">Crear efecto modular</button></div>:
          <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{selected?statuses[selected.status]:"Nuevo borrador"}</h2>
              {selected&&<span className="text-xs text-zinc-500">Versión {selected.revision} · {selected.id.slice(0,8)}</span>}
            </div>
            <fieldset disabled={Boolean(locked)||saving} className="space-y-4 disabled:opacity-65">
              <MicroEffectBuilder value={draft.effect} onChange={effect=>setDraft(d=>d?{...d,effect}:d)}/>
              <section className="space-y-3 rounded-lg border border-zinc-700 p-3">
                <h3 className="font-semibold">Valoración PCH provisional</h3>
                <p className="text-xs text-zinc-500">No se cobra al personaje; el cálculo de PCH de habilidades sigue intacto. El revisor podrá asignar un valor independiente al aprobar.</p>
                <label className="block text-xs">Propuesta PCH (opcional)
                  <input type="number" min="0" max="100000" step="1" className={"mt-1 "+field} value={draft.proposedPch??""}
                    onChange={e=>setDraft(d=>d?{...d,proposedPch:e.target.value===""?null:Number(e.target.value)}:d)}/>
                </label>
                <label className="block text-xs">Justificación o dudas de valoración
                  <textarea rows={2} maxLength={1500} className={"mt-1 "+field} value={draft.pricingNotes}
                    onChange={e=>setDraft(d=>d?{...d,pricingNotes:e.target.value}:d)}/>
                </label>
              </section>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              {!selected&&<button type="button" disabled={saving} onClick={()=>persist("CREATE")} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm disabled:opacity-40">Guardar borrador</button>}
              {selected&&["DRAFT","REJECTED"].includes(selected.status)&&<>
                <button type="button" disabled={saving} onClick={()=>persist("SAVE")} className="rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">Guardar cambios</button>
                <button type="button" disabled={saving} onClick={()=>persist("SUBMIT")} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm disabled:opacity-40">Enviar a revisión</button>
              </>}
              {selected?.status==="PENDING"&&<>
                <label className="text-xs text-zinc-300">PCH asignado por el revisor
                  <input type="number" min="1" max="100000" step="1" className={"mt-1 "+field} value={reviewedPch} onChange={e=>setReviewedPch(Number(e.target.value))}/></label>
                <button type="button" disabled={saving||reviewedPch<1||!Number.isSafeInteger(reviewedPch)} onClick={()=>persist("APPROVE")} className="self-end rounded-lg bg-emerald-700 px-3 py-2 text-sm disabled:opacity-40">Aprobar plantilla</button>
                <button type="button" disabled={saving} onClick={()=>persist("REJECT")} className="self-end rounded-lg border border-rose-700 px-3 py-2 text-sm disabled:opacity-40">Devolver</button>
              </>}
              {selected?.status==="APPROVED"&&<button type="button" onClick={clone} className="rounded-lg border border-cyan-500 px-3 py-2 text-sm">Duplicar como nuevo borrador</button>}
            </div>
          </>}
      </section>
    </div>
  </main>;
}
