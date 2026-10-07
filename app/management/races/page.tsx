"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";

type Perk = { id:number; name:string; description:string|null };
type Race = { id:number; name:string; description:string|null; imagePath:string|null; active:boolean; perkIds:number[] };

export default function RacesManagementPage() {
  const [races,setRaces]=useState<Race[]>([]);
  const [perks,setPerks]=useState<Perk[]>([]);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [imagePath,setImagePath]=useState("");
  const [selectedPerks,setSelectedPerks]=useState<number[]>([]);
  const [modalOpen,setModalOpen]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load() {
    const response=await fetch("/api/management/races");
    const data=await response.json();
    if(!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las razas.");
    setRaces(data.races ?? []);
    setPerks(data.perks ?? []);
  }

  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar."));},[]);

  function clearForm() {
    setEditingId(null);setName("");setDescription("");setImagePath("");setSelectedPerks([]);setModalOpen(false);
  }

  function edit(race:Race) {
    setEditingId(race.id);setName(race.name);setDescription(race.description??"");setImagePath(race.imagePath??"");setSelectedPerks(race.perkIds??[]);
    setError("");setSuccess("");setModalOpen(true);
  }

  function togglePerk(id:number) {
    setSelectedPerks(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  }

  async function save() {
    setError("");setSuccess("");
    if(!name.trim()){setError("La raza necesita un nombre.");return;}
    const url=editingId?"/api/management/races/"+editingId:"/api/management/races";
    const response=await fetch(url,{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim(),description,imagePath,perkIds:selectedPerks})});
    const data=await response.json().catch(()=>null);
    if(!response.ok){setError(data?.error??"No se pudo guardar la raza.");return;}
    setSuccess(editingId?"Raza actualizada.":"Raza creada.");
    clearForm();await load();
  }

  async function toggleActive(race:Race) {
    const response=await fetch("/api/management/races/"+race.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!race.active})});
    if(response.ok) await load(); else setError("No se pudo cambiar el estado.");
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <Link href="/management" className="text-sm text-zinc-500 hover:text-cyan-300">← Gestión</Link>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-4xl font-bold">Gestión de Razas</h1><p className="mt-2 text-zinc-500">Imágenes, descripción y perks de cada raza.</p></div>
      <button onClick={()=>{clearForm();setModalOpen(true);}} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">Nueva raza</button>
    </div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {races.map(race=><article key={race.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <div className="aspect-[4/3] bg-zinc-950">{race.imagePath?<img src={race.imagePath} alt={race.name} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-zinc-700">Sin imagen</div>}</div>
        <div className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{race.name}</h2><span className={race.active?"text-emerald-400":"text-zinc-600"}>{race.active?"Activa":"Inactiva"}</span></div>
          <p className="mt-2 text-sm text-zinc-500">{race.description??"Sin descripción."}</p>
          <p className="mt-3 text-xs text-zinc-600">{race.perkIds.length} perk{race.perkIds.length===1?"":"s"}</p>
          <div className="mt-4 flex gap-2"><button onClick={()=>edit(race)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">Editar</button><button onClick={()=>toggleActive(race)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">{race.active?"Desactivar":"Activar"}</button></div>
        </div>
      </article>)}
      {!races.length&&<p className="text-zinc-600">Todavía no hay razas.</p>}
    </section>

    <ManagementModal open={modalOpen} title={editingId?"Editar raza":"Nueva raza"} onClose={()=>setModalOpen(false)} maxWidth="max-w-4xl">
      <div className="grid gap-4">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de la raza" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"/>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción" rows={3} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"/>
        <input value={imagePath} onChange={e=>setImagePath(e.target.value)} placeholder="Ruta o URL de imagen" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"/>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><h3 className="font-semibold">Perks de la raza</h3><p className="mt-1 text-xs text-zinc-600">Selecciona las perks existentes del catálogo.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{perks.map(perk=><label key={perk.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 p-3"><input type="checkbox" checked={selectedPerks.includes(perk.id)} onChange={()=>togglePerk(perk.id)} className="mt-1"/><span><span className="font-medium">{perk.name}</span>{perk.description&&<span className="mt-1 block text-xs text-zinc-500">{perk.description}</span>}</span></label>)}</div>
        </div>
        <div className="flex justify-end gap-3"><button onClick={()=>setModalOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-3 text-zinc-300">Cancelar</button><button onClick={save} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">{editingId?"Guardar cambios":"Crear raza"}</button></div>
      </div>
    </ManagementModal>
  </div></main>;
}
