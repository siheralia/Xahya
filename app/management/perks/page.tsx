"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Perk={id:number;name:string;description:string|null;probability:number;effects:any[];stackable:boolean;maxStacks:number|null;active:boolean;assignedCount:number};
type Character={id:number;name:string;ownerName:string};

export default function PerksManagementPage(){
  const [perks,setPerks]=useState<Perk[]>([]);
  const [characters,setCharacters]=useState<Character[]>([]);
  const [characterId,setCharacterId]=useState("");
  const [perkId,setPerkId]=useState("");
  const [editingId,setEditingId]=useState<number|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [probability,setProbability]=useState("10");
  const [effects,setEffects]=useState("[]");
  const [stackable,setStackable]=useState(true);
  const [maxStacks,setMaxStacks]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [p,c]=await Promise.all([fetch("/api/management/perks"),fetch("/api/management/characters")]);
    const pd=await p.json(); const cd=await c.json();
    if(!p.ok) throw new Error(pd?.error??"No se pudieron cargar los perks.");
    setPerks(pd.perks??[]);
    setCharacters(cd.characters??[]);
  }
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar."));},[]);

  function clearForm(){
    setEditingId(null);setName("");setDescription("");setProbability("10");setEffects("[]");setStackable(true);setMaxStacks("");
  }

  function edit(perk:Perk){
    setEditingId(perk.id);
    setName(perk.name);
    setDescription(perk.description??"");
    setProbability(String(perk.probability));
    setEffects(JSON.stringify(perk.effects??[],null,2));
    setStackable(perk.stackable);
    setMaxStacks(perk.maxStacks==null?"":String(perk.maxStacks));
    setError("");setSuccess("");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function savePerk(){
    setError("");setSuccess("");
    if(!name.trim()){setError("El perk necesita un nombre.");return;}
    let parsed:any;
    try{parsed=JSON.parse(effects);}catch{setError("Los efectos deben ser JSON válido.");return;}
    if(!Array.isArray(parsed)){setError("Los efectos deben ser un arreglo JSON.");return;}
    const payload={name:name.trim(),description,effects:parsed,probability:Number(probability),stackable,maxStacks:stackable?null:(maxStacks===""?null:Number(maxStacks))};
    if(!Number.isFinite(payload.probability)||payload.probability<0){setError("Probabilidad inválida.");return;}
    if(!stackable&&maxStacks!==""&&(!Number.isFinite(Number(maxStacks))||Number(maxStacks)<1)){setError("El máximo de acumulaciones debe ser al menos 1.");return;}

    const url=editingId?"/api/management/perks/"+editingId:"/api/management/perks";
    const r=await fetch(url,{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok){setError(d?.error??(editingId?"No se pudo guardar.":"No se pudo crear."));return;}
    setSuccess(editingId?"Perk actualizado.":"Perk creado.");
    clearForm();
    await load();
  }

  async function updateProbability(perk:Perk,value:string){
    const probability=Number(value);
    if(!Number.isFinite(probability)||probability<0)return;
    const r=await fetch("/api/management/perks/"+perk.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({probability})});
    if(r.ok) await load();
  }

  async function toggle(perk:Perk){
    const r=await fetch("/api/management/perks/"+perk.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!perk.active})});
    if(r.ok) await load();
  }

  async function grant(){
    setError("");setSuccess("");
    if(!characterId||!perkId){setError("Selecciona personaje y perk.");return;}
    const r=await fetch("/api/management/perks/grant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),perkId:Number(perkId)})});
    const d=await r.json();if(!r.ok){setError(d?.error??"No se pudo otorgar.");return;}
    setSuccess("Perk otorgado correctamente.");
    await load();
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/management" className="text-sm text-zinc-500">← Gestión</Link><h1 className="mt-3 text-4xl font-bold">Gestión de Perks</h1><p className="mt-2 text-zinc-500">Probabilidades, acumulación, edición y entrega manual.</p></div></div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

    <section className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{editingId?"Editar perk":"Crear perk"}</h2>{editingId&&<p className="mt-1 text-xs text-cyan-300">Editando #{editingId}</p>}</div>{editingId&&<button onClick={clearForm} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">Cancelar</button>}</div>
        <div className="mt-4 grid gap-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>
          <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>
          <label className="text-sm text-zinc-400">Probabilidad<input type="number" min="0" step="0.1" value={probability} onChange={e=>setProbability(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/></label>
          <label className="text-sm text-zinc-400">Efectos JSON<textarea value={effects} onChange={e=>setEffects(e.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-mono text-xs"/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stackable} onChange={e=>setStackable(e.target.checked)}/> Acumulable</label>
          {!stackable&&<input type="number" min="1" value={maxStacks} onChange={e=>setMaxStacks(e.target.value)} placeholder="Máximo de acumulaciones" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>}
          <button onClick={savePerk} className="rounded-lg bg-white px-4 py-3 font-semibold text-black">{editingId?"Guardar cambios":"Crear perk"}</button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Otorgar perk</h2>
        <div className="mt-4 grid gap-3">
          <select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name} — {c.ownerName}</option>)}</select>
          <select value={perkId} onChange={e=>setPerkId(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Perk</option>{perks.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={grant} className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 font-semibold text-cyan-300">Otorgar</button>
        </div>
      </div>
    </section>

    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Catálogo</h2><div className="mt-4 space-y-3">{perks.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><div className="min-w-0"><div className="font-semibold">{p.name} <span className="ml-2 text-xs text-zinc-500">{p.probability}%</span></div><p className="mt-1 text-sm text-zinc-500">{p.description??"Sin descripción."}</p><p className="mt-1 text-xs text-zinc-600">{p.stackable?"Acumulable":"No acumulable"} · {p.assignedCount} otorgados</p></div><div className="flex flex-wrap items-center gap-2"><label className="text-xs text-zinc-500">Prob.<input type="number" min="0" step="0.1" defaultValue={p.probability} onBlur={e=>updateProbability(p,e.target.value)} className="ml-1 w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"/></label><button onClick={()=>edit(p)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">Editar</button><button onClick={()=>toggle(p)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">{p.active?"Desactivar":"Activar"}</button></div></div>)}</div></section>
  </div></main>;
}
