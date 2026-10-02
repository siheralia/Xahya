"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

type Theme={id:number;name:string;slug:string;description:string|null;active:boolean;imagePath?:string|null;imageUrl?:string|null};

export default function ThemeManagement(){
  const [themes,setThemes]=useState<Theme[]>([]);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/management/themes",{cache:"no-store"});
    const d=await r.json();
    if(!r.ok) throw new Error(d?.error??"No se pudieron cargar las temáticas.");
    setThemes(Array.isArray(d)?d:[]);
  }
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"No se pudieron cargar las temáticas."));},[]);

  async function create(){
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/management/themes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description})});
      const d=await r.json();
      if(!r.ok) throw new Error(d?.error??"No se pudo crear la temática.");
      setName("");setDescription("");await load();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo crear la temática.");}
    finally{setBusy(false);}
  }

  async function uploadImage(theme:Theme,file:File){
    setError("");
    const form=new FormData();form.append("file",file);form.append("themeId",String(theme.id));
    const r=await fetch("/api/management/themes/image",{method:"POST",body:form});const d=await r.json();
    if(!r.ok){setError(d?.error??"No se pudo subir la imagen.");return;} await load();
  }

  async function remove(theme:Theme){
    if(["GENERAL","TODAS"].includes(theme.slug)) return;
    if(!window.confirm('¿Eliminar la temática "'+theme.name+'"?')) return;
    setError("");
    const r=await fetch("/api/management/themes/"+theme.id,{method:"DELETE"});
    const d=await r.json();
    if(!r.ok){setError(d?.error??"No se pudo eliminar.");return;}
    await load();
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-5xl px-6 py-8">
    <div className="flex justify-between gap-4"><div><h1 className="text-4xl font-bold">Temáticas</h1><p className="mt-2 text-zinc-500">Define los ambientes que pueden limitar los enemigos de los laberintos.</p></div><Link href="/management" className="rounded-lg border border-zinc-700 px-4 py-2">← Gestión</Link></div>
    {error&&<p className="mt-5 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-red-300">{error}</p>}
    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Nueva temática</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre, ej. No muertos" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción opcional" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 md:col-span-2"/></div><button onClick={create} disabled={busy||!name.trim()} className="mt-4 rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-40">{busy?"Procesando...":"Crear temática"}</button></section>
    <section className="mt-8 grid gap-3">{themes.map(t=><div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><div className="flex items-center justify-between gap-3"><div><span className="font-semibold">{t.name}</span><span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500">{t.slug}</span></div>{!["GENERAL","TODAS"].includes(t.slug)&&<button onClick={()=>remove(t)} className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-300">Eliminar</button>}</div>{t.description&&<p className="mt-2 text-sm text-zinc-500">{t.description}</p>}<div className="mt-3 flex items-center gap-3">{t.imageUrl&&<img src={t.imageUrl} alt={"Fondo de "+t.name} className="h-16 w-28 rounded-lg object-cover opacity-70"/>}<label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900">Subir fondo<input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)uploadImage(t,f);e.currentTarget.value=""}}/></label></div>{t.slug==="GENERAL"&&<p className="mt-2 text-xs text-zinc-600">Solo laberintos sin temática.</p>}{t.slug==="TODAS"&&<p className="mt-2 text-xs text-zinc-600">Puede aparecer en cualquier laberinto.</p>}</div>)}</section>
  </div></main>;
}
