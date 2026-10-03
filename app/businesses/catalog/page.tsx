"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character={id:number;name:string;money?:number};
type Product={id:number;itemId:number;purchasePrice:number;salePrice:number;stock:number;item:{id:number;name:string;description:string|null;imageUrl:string|null}|null};
type Plan={id:number;name:string;description:string|null;price:number;intervalValue:number;intervalUnit:string};
type Business={id:number;name:string;description:string|null;products:Product[];subscriptionPlans:Plan[]};

export default function BusinessCatalogPage(){
  const [businesses,setBusinesses]=useState<Business[]>([]);
  const [characters,setCharacters]=useState<Character[]>([]);
  const [characterId,setCharacterId]=useState("");
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(""); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{
      const [c,b]=await Promise.all([fetch("/api/characters?mine=true",{cache:"no-store"}),fetch("/api/businesses/catalog",{cache:"no-store"})]);
      const cd=await c.json();const bd=await b.json();if(!c.ok)throw new Error(cd?.error??"No se pudieron cargar tus personajes.");if(!b.ok)throw new Error(bd?.error??"No se pudo cargar el catálogo.");
      const next=Array.isArray(cd)?cd:[];setCharacters(next);setBusinesses(bd.businesses??[]);if(!characterId&&next.length)setCharacterId(String(next[0].id));
    }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar.");}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  async function buyProperty(productId:number,name:string){
    setBusy("p"+productId);setError("");setSuccess("");
    try{const r=await fetch("/api/businesses/property",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),productId})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error??"No se pudo comprar la propiedad.");setSuccess("Compraste "+name+".");await load();}catch(e){setError(e instanceof Error?e.message:"No se pudo comprar.")}finally{setBusy("")}
  }
  async function subscribe(planId:number,name:string){
    setBusy("s"+planId);setError("");setSuccess("");
    try{const r=await fetch("/api/businesses/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),planId})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error??"No se pudo activar la suscripción.");setSuccess("Suscripción activada: "+name+".");await load();}catch(e){setError(e instanceof Error?e.message:"No se pudo activar.")}finally{setBusy("")}
  }
  const character=characters.find(c=>String(c.id)===characterId);
  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">Negocios</h1><p className="mt-2 text-zinc-500">Membresías y propiedades disponibles para tus personajes.</p></div><div className="flex gap-2"><select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Link href="/businesses" className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300">Mis negocios</Link></div></div>
    <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm">Dinero: <span className="font-semibold text-amber-300">◈ {Number(character?.money??0).toLocaleString("es-MX")}</span></div>
    {error&&<div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}{success&&<div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}
    {loading?<p className="mt-8 text-zinc-500">Cargando...</p>:<div className="mt-8 space-y-6">{businesses.map(b=><section key={b.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-2xl font-bold">{b.name}</h2><p className="mt-1 text-sm text-zinc-500">{b.description||"Sin descripción."}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2"><div><h3 className="font-semibold">Suscripciones</h3>{b.subscriptionPlans.length? <div className="mt-3 space-y-3">{b.subscriptionPlans.map(p=><article key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{p.name}</p><p className="mt-1 text-sm text-zinc-500">{p.description||"Sin descripción."}</p></div><span className="text-amber-300">◈ {p.price.toLocaleString("es-MX")}</span></div><p className="mt-2 text-xs text-zinc-600">Cada {p.intervalValue} {p.intervalUnit.toLowerCase()}(s)</p><button onClick={()=>subscribe(p.id,p.name)} disabled={busy!==""||!characterId} className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{busy==="s"+p.id?"Activando...":"Suscribirme"}</button></article>)}</div>:<p className="mt-2 text-sm text-zinc-600">Sin planes activos.</p>}</div>
      <div><h3 className="font-semibold">Propiedades</h3>{b.products.length?<div className="mt-3 grid gap-3">{b.products.map(p=><article key={p.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">{p.item?.imageUrl&&<img src={p.item.imageUrl} alt={p.item.name} className="h-40 w-full object-cover" />}<div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{p.item?.name??"Propiedad"}</p><p className="mt-1 text-xs text-zinc-600">Disponibles: {p.stock}</p></div><span className="text-amber-300">◈ {p.salePrice.toLocaleString("es-MX")}</span></div>{p.item?.description&&<p className="mt-3 text-sm text-zinc-500">{p.item.description}</p>}<button onClick={()=>buyProperty(p.id,p.item?.name??"Propiedad")} disabled={busy!==""||!characterId} className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{busy==="p"+p.id?"Comprando...":"Comprar propiedad"}</button></div></article>)}</div>:<p className="mt-2 text-sm text-zinc-600">Sin propiedades disponibles.</p>}</div></div>
    </section>)}{!businesses.length&&<p className="text-zinc-600">No hay negocios con ofertas activas.</p>}</div>}
  </div></main>;
}