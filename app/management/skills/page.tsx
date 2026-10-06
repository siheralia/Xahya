"use client";

import { useEffect, useMemo, useState } from "react";
import ManagementModal from "../_components/ManagementModal";
import { EFFECT_CATALOG, EFFECT_TARGETS } from "@/lib/effects/catalog";

type Effect = { type: string; target?: string; value?: number; description?: string };
type Skill = {
  id:number; characterId:number; name:string; cost:number; accumulationCost:number; accumulationPerTick:number; maintenanceCost:number; description:string|null; duration:string|null;
  category:string; basicType:string|null; attackType:string|null; defenseType:string|null; areaOfEffect:string|null; speed:string|null; cooldown:string|null; effect:Effect[];
  condition:string|null; status:string; approvedAt:string|null; character?: { id:number; name:string }|null;
};

const categories = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]];
const effectTypes=[...EFFECT_CATALOG.filter(e=>e.type!=="MAZE_UTILITY").map(e=>[e.type,e.label] as const),["MAZE_UTILITY_INVISIBILITY","Invisibilidad"]] as const;
const blankEffect=():Effect=>({type:"STAT_BONUS",target:"STR",value:10,description:""});
const blankForm=()=>({characterId:"",name:"",cost:0,accumulationCost:0,accumulationPerTick:0,maintenanceCost:0,description:"",duration:"",category:"UTILITY",areaOfEffect:"",speed:"",cooldown:"",condition:"",effect:[] as Effect[]});

export default function SkillsManagementPage(){
  const [skills,setSkills]=useState<Skill[]>([]);
  const [characters,setCharacters]=useState<{id:number;name:string}[]>([]);
  const [filter,setFilter]=useState("PENDING");
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState(blankForm());
  const [modal,setModal]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");

  async function load(){
    setError("");
    try{
      const [sr,cr]=await Promise.all([fetch("/api/management/skills",{cache:"no-store"}),fetch("/api/characters?mine=false",{cache:"no-store"})]);
      const sd=await sr.json(); const cd=await cr.json();
      if(!sr.ok) throw new Error(sd.error);
      setSkills(sd.skills??[]);
      if(cr.ok) setCharacters((cd??[]).map((c:any)=>({id:Number(c.id),name:String(c.name)})));
    }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar las habilidades.");}
  }
  useEffect(()=>{void load();},[]);

  const visible=useMemo(()=>skills.filter(s=>{
    const q=search.trim().toLowerCase();
    return (filter==="ALL"||s.status===filter) &&
      (!q||s.name.toLowerCase().includes(q)||String(s.character?.name??"").toLowerCase().includes(q));
  }),[skills,filter,search]);

  function edit(skill:Skill){
    setSelected(skill.id);
    setForm({
      characterId:String(skill.characterId),name:skill.name,cost:Number(skill.cost),accumulationCost:Number(skill.accumulationCost??0),accumulationPerTick:Number(skill.accumulationPerTick??0),maintenanceCost:Number(skill.maintenanceCost??0),description:skill.description??"",
      duration:skill.duration??"",category:skill.category,areaOfEffect:skill.areaOfEffect??"",speed:skill.speed??"",
      cooldown:skill.cooldown??"",condition:skill.condition??"",effect:Array.isArray(skill.effect)?skill.effect:[],
    });
    setModal(true);setError("");setSuccess("");
  }
  function create(){
    setSelected(null);setForm(blankForm());setModal(true);setError("");setSuccess("");
  }
  function addEffect(){setForm(f=>({...f,effect:[...f.effect,blankEffect()]}));}
  function updateEffect(i:number,key:string,value:string){
    setForm(f=>({...f,effect:f.effect.map((e,idx)=>{
      if(idx!==i) return e;
      if(key==="type" && value==="MAZE_UTILITY_INVISIBILITY") return {...e,type:"MAZE_UTILITY",target:"INVISIBILITY",value:1};
      return {...e,[key]:key==="value"?Number(value):value};
    })}));
  }
  async function save(approve=false,reject=false){
    if(!form.characterId){setError("Selecciona el personaje.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      const url=selected?"/api/management/skills/"+selected:"/api/management/skills";
      const body={...form,characterId:Number(form.characterId),approve,reject};
      const r=await fetch(url,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const raw=await r.text();
      let d:any={};
      try { d=raw?JSON.parse(raw):{}; } catch { d={}; }
      if(!r.ok) throw new Error(d.error||`Error HTTP ${r.status}`);
      setSuccess(approve?"Habilidad aprobada.":reject?"Habilidad rechazada.":"Cambios guardados sin aprobar.");
      setModal(false);
      setSelected(null);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
    finally{setBusy(false);}
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-4xl font-bold">Habilidades</h1><p className="mt-2 text-zinc-500">Solicitudes de habilidades creadas por personajes y catálogo aprobado.</p></div>
      <button onClick={create} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">Nueva habilidad</button>
    </div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}
    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar habilidad o personaje..." className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/>
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
          <option value="PENDING">Pendientes</option><option value="APPROVED">Aprobadas</option><option value="REJECTED">Rechazadas</option><option value="ALL">Todas</option>
        </select>
      </div>
      <div className="mt-5 space-y-3">
        {visible.map(skill=><button key={skill.id} onClick={()=>edit(skill)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-left hover:border-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><span className="font-semibold">{skill.name}</span><span className="ml-2 text-xs text-zinc-500">#{skill.id}</span></div>
            <span className={"rounded-full border px-2 py-1 text-xs "+(skill.status==="APPROVED"?"border-emerald-400/30 text-emerald-300":skill.status==="REJECTED"?"border-red-400/30 text-red-300":"border-amber-400/30 text-amber-300")}>{skill.status==="APPROVED"?"Aprobada":skill.status==="REJECTED"?"Rechazada":"Pendiente"}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{skill.character?.name??("Personaje #"+skill.characterId)} · {categories.find(c=>c[0]===skill.category)?.[1]??skill.category} · Coste {skill.cost}{Number(skill.accumulationCost??0)>0?" · Acumulación "+skill.accumulationCost:""}{Number(skill.accumulationPerTick??0)>0?" · +"+skill.accumulationPerTick+" acumulación/tick":""}{Number(skill.maintenanceCost??0)>0?" · Mantenimiento/turno "+skill.maintenanceCost:""}</p>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{skill.description}</p>
        </button>)}
        {!visible.length&&<p className="py-8 text-center text-sm text-zinc-500">No hay habilidades con este filtro.</p>}
      </div>
    </section>

    <ManagementModal open={modal} title={selected?"Editar habilidad":"Crear habilidad"} onClose={()=>setModal(false)} maxWidth="max-w-4xl">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">Personaje<select value={form.characterId} onChange={e=>setForm({...form,characterId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Selecciona...</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}</select></label>
          <label className="text-sm text-zinc-400">Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Coste<input type="number" min="0" value={form.cost} onChange={e=>setForm({...form,cost:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Costo por acumulación<input type="number" min="0" value={form.accumulationCost} onChange={e=>setForm({...form,accumulationCost:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Acumulaciones por tick<input type="number" min="0" value={form.accumulationPerTick} onChange={e=>setForm({...form,accumulationPerTick:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>\n          <label className="text-sm text-zinc-400">Costo por turno (mantenimiento)<input type="number" min="0" value={form.maintenanceCost} onChange={e=>setForm({...form,maintenanceCost:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{categories.map(c=><option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></label>
          <label className="text-sm text-zinc-400">Duración<input value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} placeholder="Ej. 3 turnos / Instantánea" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Velocidad<input value={form.speed} onChange={e=>setForm({...form,speed:e.target.value})} placeholder="Ej. 1 turno / Instantánea" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Cooldown<input value={form.cooldown} onChange={e=>setForm({...form,cooldown:e.target.value})} placeholder="Ej. 2 turnos" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label className="text-sm text-zinc-400">Área de efecto<input value={form.areaOfEffect} onChange={e=>setForm({...form,areaOfEffect:e.target.value})} placeholder="Ej. 5 m / Objetivo único" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
        </div>
        <label className="block text-sm text-zinc-400">Descripción<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={4} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
        {form.category==="PASSIVE"&&<label className="block text-sm text-zinc-400">Condición de la pasiva<input value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})} placeholder="Ej. Mientras tenga más de 50% de HP" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Efecto</h3><p className="text-xs text-zinc-500">Los ofensivos pueden usar × sobre el ataque actual; soporte/pasiva pueden mostrar buffs.</p></div><button type="button" onClick={addEffect} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">+ Añadir</button></div>
          <div className="mt-4 space-y-3">{form.effect.map((effect,i)=>{
            const narrative=effect.type==="NARRATIVE";
            const targets=EFFECT_TARGETS[effect.type as keyof typeof EFFECT_TARGETS]??[];
            return <div key={i} className="grid gap-2 sm:grid-cols-[170px_1fr_110px_auto]">
              <select value={effect.type==="MAZE_UTILITY"&&effect.target==="INVISIBILITY"?"MAZE_UTILITY_INVISIBILITY":(effect.type??"STAT_BONUS")} onChange={e=>updateEffect(i,"type",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">{effectTypes.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
              {!narrative?(targets.length?<select value={effect.target??targets[0]} onChange={e=>updateEffect(i,"target",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">{targets.map(t=><option key={t} value={t}>{t}</option>)}</select>:<div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-2 text-sm text-zinc-400">Sin objetivo adicional</div>):<input value={effect.description??""} onChange={e=>updateEffect(i,"description",e.target.value)} placeholder="Descripción del efecto" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"/>}
              {!narrative?<input type="number" step="0.01" value={effect.value??0} onChange={e=>updateEffect(i,"value",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm" placeholder="Valor"/>:<span/>}
              <button type="button" onClick={()=>setForm(f=>({...f,effect:f.effect.filter((_,idx)=>idx!==i)}))} className="rounded-lg border border-red-900/60 px-2 py-2 text-sm text-red-300">Quitar</button>
            </div>;
          })}{!form.effect.length&&<p className="text-sm text-zinc-600">Sin efectos estructurados.</p>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>save(false,false)} disabled={busy} className="rounded-lg border border-zinc-700 px-4 py-3 font-medium">Guardar sin aprobar</button>
          <button onClick={()=>save(false,true)} disabled={busy} className="rounded-lg border border-red-900/70 px-4 py-3 font-medium text-red-300">Rechazar</button>
          <button onClick={()=>save(true,false)} disabled={busy} className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950">Guardar y aprobar</button>
        </div>
      </div>
    </ManagementModal>
  </div></main>;
}
