"use client";
import {useEffect,useMemo,useState} from "react";
import ManagementModal from "@/app/management/_components/ManagementModal";
import {SkillEffectsEditor, type EditableEffect, type NarrativeCard} from "./SkillEffectsEditor";
import type {RacialSkill} from "@/lib/skills/racial-catalog";

type Race={id:number;name:string};
type Form={raceId:number;name:string;description:string;category:string;manaCost:number;maintenanceCost:number;active:boolean;effect:EditableEffect[]};
const blank=(raceId:number):Form=>({raceId,name:"",description:"",category:"UTILITY",manaCost:0,maintenanceCost:0,active:true,effect:[]});
const categories=[["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"]];

export function RacialSkillsManagement(){
  const [skills,setSkills]=useState<RacialSkill[]>([]);
  const [races,setRaces]=useState<Race[]>([]);
  const [effectDefinitions,setEffectDefinitions]=useState<{type:string;label:string;targets:{key:string;label:string}[]}[]>([]);
  const [narrativeCards,setNarrativeCards]=useState<NarrativeCard[]>([]);
  const [statistics,setStatistics]=useState<{key:string;name:string;kind:"basic"|"derived";active?:boolean}[]>([]);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState<Form>(blank(0));
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const r=await fetch("/api/management/racial-skills",{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error??"No se cargó el catálogo racial.");
    setSkills(d.racialSkills??[]);
    setRaces(d.races??[]);
  }
  useEffect(()=>{
    void load().catch(e=>setError(e instanceof Error?e.message:"Error de carga."));
    fetch("/api/management/effect-targets",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
      if(d?.effects)setEffectDefinitions(d.effects);
      if(d?.narrativeCards)setNarrativeCards(d.narrativeCards);
      if(d?.statistics)setStatistics(d.statistics);
    }).catch(()=>{});
  },[]);
  const filtered=useMemo(()=>skills.filter(s=>(s.name+" "+(s.raceName??"")).toLowerCase().includes(search.toLowerCase())),[skills,search]);

  function create(){setSelected(null);setForm(blank(races[0]?.id??0));setError("");setSuccess("");setOpen(true);}
  function edit(s:RacialSkill){
    setSelected(s.id);setForm({raceId:s.raceId,name:s.name,description:s.description??"",category:s.category,manaCost:s.manaCost,maintenanceCost:s.maintenanceCost,active:s.active,effect:Array.isArray(s.effect)?s.effect:[]});
    setError("");setSuccess("");setOpen(true);
  }
  async function save(){
    if(!form.raceId||!form.name.trim()){setError("Selecciona una raza e introduce un nombre.");return;}
    setBusy(true);setError("");setSuccess("");
    try {
      const endpoint=selected?"/api/management/racial-skills/"+selected:"/api/management/racial-skills";
      const r=await fetch(endpoint,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"No se pudo guardar.");
      setOpen(false);setSuccess(selected?"Habilidad racial actualizada.":"Habilidad racial creada.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Error al guardar.");}
    finally{setBusy(false);}
  }
  return <section className="mt-6 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Catálogo de habilidades raciales</h2><p className="mt-1 text-sm text-zinc-400">Se conceden automáticamente según la raza. Configura sus efectos, elementos y capacidades sin editar código.</p></div>
      <button type="button" onClick={create} className="rounded-lg bg-white px-4 py-3 font-semibold text-zinc-950">Nueva habilidad racial</button>
    </div>
    {error&&!open&&<p role="alert" className="rounded-lg border border-red-800 p-3 text-sm text-red-300">{error}</p>}
    {success&&<p role="status" className="rounded-lg border border-emerald-800 p-3 text-sm text-emerald-300">{success}</p>}
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o raza..." aria-label="Buscar habilidad racial" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"/>
    <div className="grid gap-3 md:grid-cols-2">
      {filtered.map(s=><button type="button" key={s.id} onClick={()=>edit(s)} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left hover:border-cyan-700">
        <div className="flex justify-between gap-3"><div><b>{s.name}</b><span className="ml-2 text-xs text-zinc-500">#{s.id}</span></div><span className={s.active?"text-xs text-emerald-400":"text-xs text-zinc-500"}>{s.active?"Activa":"Inactiva"}</span></div>
        <p className="mt-1 text-sm text-cyan-300">{s.raceName??races.find(r=>r.id===s.raceId)?.name??("Raza #"+s.raceId)}</p>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{s.description||"Sin descripción"}</p>
        <p className="mt-2 text-xs text-zinc-500">{s.effect.length} efecto(s) · {s.manaCost} maná · {s.maintenanceCost} mantenimiento</p>
        {s.effect.some(e=>e.capability)&&<p className="mt-2 text-xs text-amber-300">{s.effect.filter(e=>e.capability).map(e=>e.capability+(e.element?" + "+e.element:"")).join(", ")}</p>}
      </button>)}
      {!filtered.length&&<p className="py-8 text-zinc-500">No hay habilidades raciales que coincidan.</p>}
    </div>

    <ManagementModal open={open} title={selected?"Editar habilidad racial":"Crear habilidad racial"} maxWidth="max-w-4xl" onClose={()=>{if(!busy)setOpen(false);}}>
      <div className="space-y-4 text-white">
        {error&&<p role="alert" className="rounded-lg border border-red-800 p-3 text-sm text-red-300">{error}</p>}
        <label className="block text-sm text-zinc-300">Raza<select value={form.raceId} onChange={e=>setForm(f=>({...f,raceId:Number(e.target.value)}))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
          <option value={0}>Selecciona una raza</option>{races.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select></label>
        <label className="block text-sm text-zinc-300">Nombre<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} maxLength={120} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3"/></label>
        <label className="block text-sm text-zinc-300">Descripción<textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} maxLength={5000} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3"/></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-zinc-300">Categoría<select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm text-zinc-300">Maná<input type="number" min={0} step={1} value={form.manaCost} onChange={e=>setForm(f=>({...f,manaCost:Number(e.target.value)}))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3"/></label>
          <label className="text-sm text-zinc-300">Mantenimiento<input type="number" min={0} step={1} value={form.maintenanceCost} onChange={e=>setForm(f=>({...f,maintenanceCost:Number(e.target.value)}))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3"/></label>
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>Activa: conceder automáticamente a los personajes de esta raza</label>
        <SkillEffectsEditor effects={form.effect} onChange={effect=>setForm(f=>({...f,effect}))} statistics={statistics} effectDefinitions={effectDefinitions} narrativeCards={narrativeCards}/>
        <p className="text-xs text-zinc-400">Para Fotoconstrucción: configura «Capacidad para requisitos: Crear» y «Elemento: Luz» en su efecto. Las habilidades raciales no cuestan PCH al concederse.</p>
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-3">Cancelar</button><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-zinc-950 disabled:opacity-40">{busy?"Guardando...":"Guardar habilidad racial"}</button></div>
      </div>
    </ManagementModal>
  </section>;
}
