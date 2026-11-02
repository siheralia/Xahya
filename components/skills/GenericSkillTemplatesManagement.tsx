"use client";

import {useCallback,useEffect,useState} from "react";
import {SkillFormModal} from "@/components/skills/SkillFormModal";
import type {EditableEffect} from "@/components/skills/SkillEffectsEditor";
import type {SkillMechanics} from "@/lib/skills/interaction-engine";
import type {EffectPricingMap} from "@/lib/skills/pch";
import type {DurationPricing} from "@/lib/effects/duration-pricing";
import {configuredSkillEffectPch} from "@/lib/skills/configured-effect-pricing";
import {calculateGenericPricePreview} from "@/lib/skills/generic-preview";

type Template={
 id:number;name:string;description:string|null;parentTemplateId:number|null;
 payload:Record<string,any>;elementChoice:boolean;enabled:boolean;
 pchCost:number|null;totalPch:number|null;validationError?:string;
};
type FormData={
 name:string;description:string;category:string;cost:number;
 maintenanceCost:number;accumulationCost:number;accumulationPerTick:number;
 duration:string;areaOfEffect:string;maxRangeMeters:number;speed:string;cooldown:string;condition:string;
 effect:EditableEffect[];effectRequirements:{effect:string;element?:string}[];
 mechanics:SkillMechanics;
};
const blank=():FormData=>({
 name:"",description:"",category:"SUPPORT",cost:0,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,duration:"Instantánea",
 areaOfEffect:"Objetivo único",maxRangeMeters:5,speed:"DEFAULT",
 cooldown:"Sin cooldown",condition:"",
 effect:[],effectRequirements:[],mechanics:{},
});
type CatalogProps={
 statistics:{key:string;name:string;kind:"basic"|"derived";active?:boolean;code?:string}[];
 narrativeCards:{id:string;name:string;description:string;category?:string;pch?:number}[];
 effectDefinitions:{type:string;label:string;targets:{key:string;label:string}[]}[];
 effectPricing:EffectPricingMap;durationPricing:DurationPricing;pricingReady:boolean;
};
export function GenericSkillTemplatesManagement({statistics,narrativeCards,effectDefinitions,effectPricing,durationPricing,pricingReady}:CatalogProps){
 const [templates,setTemplates]=useState<Template[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [modal,setModal]=useState(false);
 const [selected,setSelected]=useState<number|null>(null);
 const [form,setForm]=useState<FormData>(blank());
 const [parentId,setParentId]=useState<string>("");
 const [elementChoice,setElementChoice]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const priceEffect=(effect:EditableEffect)=>configuredSkillEffectPch(effect,narrativeCards,effectPricing,durationPricing);
 let preview:ReturnType<typeof calculateGenericPricePreview>|null=null;
 let previewError="";
 if(pricingReady){
  try{
   preview=calculateGenericPricePreview(form,parentId?Number(parentId):null,templates,priceEffect);
  }catch(e){previewError=e instanceof Error?e.message:"No se pudo calcular el costo PCH.";}
 }

 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const r=await fetch("/api/management/generic-skills",{cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error??"No se pudo cargar el catálogo.");
   setTemplates(d.templates??[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el catálogo.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 function create(){
  setSelected(null);setForm(blank());setParentId("");setElementChoice(false);
  setEnabled(false);setError("");setMessage("");setModal(true);
 }
 function edit(t:Template){
  const p=t.payload??{};
  setSelected(t.id);setParentId(t.parentTemplateId==null?"":String(t.parentTemplateId));
  setElementChoice(t.elementChoice);setEnabled(t.enabled);
  setForm({...blank(),...p,name:t.name,description:t.description??"",
   effect:Array.isArray(p.effect)?p.effect:[],
   effectRequirements:Array.isArray(p.effectRequirements)?p.effectRequirements:[],
   mechanics:p.mechanics??{}});
  setError("");setMessage("");setModal(true);
 }
 async function save(){
  if(!form.name.trim()||!form.description.trim()){setError("Completa nombre y descripción.");return;}
  if(!pricingReady||!preview){setError(previewError||"No se ha cargado el catálogo de precios.");return;}
  if(parentId&&preview.additional<1){setError("La especialización debe agregar al menos 1 PCH al costo de la habilidad base.");return;}
  if(form.effect.length===0&&!parentId){setError("La habilidad base necesita al menos un efecto.");return;}
  setBusy(true);setError("");setMessage("");
  try {
   const r=await fetch("/api/management/generic-skills",{
    method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     ...(selected?{id:selected}:{}),
     name:form.name,description:form.description,
     parentTemplateId:parentId?Number(parentId):null,elementChoice,enabled,
     payload:form,
    }),
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error??"No se pudo guardar la habilidad genérica.");
   setMessage("Plantilla guardada. Coste de adquisición: "+d.pchCost+" PCH.");
   setModal(false);await load();
  }catch(e){setError(e instanceof Error?e.message:"Error al guardar.");}
  finally{setBusy(false);}
 }
 return <section className="mt-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div><h2 className="text-xl font-semibold">Habilidades genéricas</h2>
    <p className="mt-1 text-sm text-zinc-400">Define técnicas oficiales que los jugadores pueden adquirir con PCH. Las especializaciones heredan los efectos de una plantilla base y cobran únicamente el incremento.</p></div>
   <button type="button" onClick={create} className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-zinc-950">Nueva genérica</button>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-red-700/50 p-3 text-sm text-red-300">{error}</p>}
  {message&&<p className="rounded-lg border border-emerald-700/50 p-3 text-sm text-emerald-300">{message}</p>}
  {loading?<p className="text-sm text-zinc-400">Cargando catálogo…</p>:
   templates.length===0?<p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-400">Todavía no hay habilidades genéricas publicadas. No se crean automáticamente.</p>:
   <div className="grid gap-3 sm:grid-cols-2">
    {templates.map(t=><button key={t.id} type="button" onClick={()=>edit(t)}
     className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-left hover:border-cyan-600">
     <div className="flex justify-between gap-2"><b>{t.name}</b><span className={"text-xs "+(t.enabled?"text-emerald-300":"text-amber-300")}>{t.enabled?"Publicada":"Borrador"}</span></div>
     <p className="mt-1 text-xs text-zinc-400">{t.description}</p>
     {t.parentTemplateId!==null&&<p className="mt-2 text-xs text-violet-300">Evoluciona: {templates.find(s=>s.id===t.parentTemplateId)?.name??("#"+t.parentTemplateId)}</p>}
     {t.elementChoice&&<p className="mt-1 text-xs text-cyan-300">Elemento a elección del comprador</p>}
     <p className="mt-2 text-sm font-medium">{t.pchCost===null?"Precio no disponible":t.pchCost+" PCH"}{t.parentTemplateId!==null?" adicionales":""}</p>
     {t.validationError&&<p className="mt-2 text-xs text-red-300">{t.validationError}</p>}
    </button>)}
   </div>}
  <SkillFormModal open={modal} title={selected?"Editar plantilla genérica":"Nueva habilidad genérica"}
   description="Configura únicamente los efectos nuevos de esta plantilla. Si eliges una base, el comprador heredará su configuración y pagará solo el incremento."
   onClose={()=>setModal(false)} form={form} onChange={setForm}
   statistics={statistics} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions}
   priceEffect={pricingReady?priceEffect:undefined}
   pch={preview?{total:preview.total,base:preview.base,manaAdjusted:preview.manaAdjusted,
    beforeRequirements:preview.beforeRequirements,baseline:preview.baseline,
    genericSpecialization:!!parentId}:undefined}
   characterSelector={<div className="grid gap-3 rounded-xl border border-violet-800/50 p-4 sm:grid-cols-2">
    <label className="text-sm text-zinc-400">Habilidad genérica base
     <select value={parentId} onChange={e=>setParentId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2">
      <option value="">Ninguna: técnica básica</option>
      {templates.filter(t=>t.id!==selected).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
     </select>
    </label>
    <div className="space-y-2">
     <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input type="checkbox" checked={elementChoice} onChange={e=>setElementChoice(e.target.checked)}/>
      Permitir elegir el elemento de «Imbuir elemento»
     </label>
     <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
      Publicar en el catálogo
     </label>
    </div>
   </div>}
   actions={<div className="space-y-3">
    {!pricingReady&&<p role="status" className="text-sm text-amber-300">Cargando precios y estadísticas configuradas…</p>}
    {pricingReady&&previewError&&<p role="alert" className="text-sm text-amber-300">{previewError}</p>}
    {preview&&parentId&&<p className="text-sm text-violet-200">Costo total: {preview.total} PCH · Especialización: {Math.max(0,preview.additional)} PCH adicionales</p>}
    <button type="button" disabled={busy||!pricingReady||!preview||(!!parentId&&preview.additional<1)} onClick={()=>void save()} className="w-full rounded-lg bg-cyan-400 p-3 font-semibold text-zinc-950 disabled:opacity-50">{busy?"Guardando...":"Guardar plantilla genérica"}</button>
   </div>}
  />
 </section>;
}
