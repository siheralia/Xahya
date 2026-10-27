"use client";

import type { EffectPricingMap } from "@/lib/skills/pch";

import Link from "next/link";
import { useEffect, useState } from "react";

type Target = { key: string; label: string };
type EffectDefinition = { type: string; label: string; mode: string; targets: Target[] };
type Statistic = { key: string; code?: string; name: string; kind: string };

const modes: Record<string, string> = {
  bonus: "Suma fija", multiplier: "Multiplicador", text: "Narrativo", special: "Especial",
};

export default function EffectsManagementPage() {
  const [effects, setEffects] = useState<EffectDefinition[]>([]);
  const [cards,setCards] = useState<{id:string;name:string;description:string;category:string;pch:number;enabled:boolean}[]>([]);
  const [cardName,setCardName] = useState("");
  const [cardDescription,setCardDescription] = useState("");
  const [cardPch,setCardPch] = useState(5);
  useEffect(()=>{fetch("/api/effects/narrative-cards").then(r=>r.json()).then(d=>setCards(d.cards??[])).catch(()=>{});},[]);
  async function saveCard(card:{id:string;name:string;description:string;pch:number;enabled:boolean}) {
    setSaving(card.id);
    try {
      const response=await fetch("/api/effects/narrative-cards",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(card)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error??"Error");
      setCards(old=>old.map(c=>c.id===card.id?data.card:c));setNotice("Tarjeta actualizada");
    }catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}
  }
  async function createCard(){
    setSaving("new-card");
    try {
      const response=await fetch("/api/effects/narrative-cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:cardName,description:cardDescription,category:"Narrativo",icon:"sparkles",pch:cardPch})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error??"Error");
      setCards(old=>[...old,data.card]);setCardName("");setCardDescription("");setNotice("Tarjeta creada");
    }catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}
  }

  const [pricing,setPricing] = useState<EffectPricingMap>({});
  const [saving,setSaving] = useState<string|null>(null);
  const [notice,setNotice] = useState("");
  useEffect(()=>{ fetch("/api/management/effects").then(r=>r.ok?r.json():null).then(data=>{if(data?.pricing)setPricing(data.pricing);}).catch(()=>{});},[]);
  async function savePricing(type:string){setSaving(type);setNotice("");try{const response=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,...pricing[type]})});const data=await response.json();if(!response.ok)throw Error(data.error??"No se pudo guardar");setPricing(data.pricing);setNotice("Precio actualizado.");}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}}

  const [statistics, setStatistics] = useState<Statistic[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/management/effect-targets", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No tienes acceso a la gestión de efectos.");
        return response.json();
      })
      .then((data) => {
        setEffects(Array.isArray(data.effects) ? data.effects : []);
        setStatistics(Array.isArray(data.statistics) ? data.statistics : []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar los efectos."))
      .finally(() => setLoading(false));
  }, []);

  const visible = effects.filter((effect) => (effect.label + " " + effect.type + " " + effect.mode).toLowerCase().includes(search.toLowerCase()));
  const active = effects.find((effect) => effect.type === selected);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <div className="space-y-2">
        <Link href="/management" className="text-sm text-cyan-300 hover:underline">← Administración</Link>
        <h1 className="text-3xl font-bold">Gestión de efectos</h1>
        <p className="text-sm text-zinc-400">Catálogo central de tipos, operaciones y objetivos para habilidades, perks y objetos. Los precios se pueden editar aquí; las habilidades existentes conservan su costo histórico.</p>
      </div>
      {notice && <p role="status" className="text-sm text-cyan-300">{notice}</p>}
      <section className="space-y-4 rounded-2xl border border-cyan-900 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Constructor de tarjetas narrativas</h2>
        <p className="text-sm text-zinc-400">Crea efectos originales para rol escrito. PCH editorial, aún no descontado automáticamente.</p>
        <input aria-label="Nombre del efecto" placeholder="Nombre del efecto" value={cardName} onChange={e=>setCardName(e.target.value)} className="w-full rounded-lg bg-zinc-950 p-3" />
        <textarea aria-label="Descripción" placeholder="Describe el efecto narrativo" value={cardDescription} onChange={e=>setCardDescription(e.target.value)} className="w-full rounded-lg bg-zinc-950 p-3" />
        <label className="block text-sm">Costo PCH propuesto<input type="number" min={0} value={cardPch} onChange={e=>setCardPch(Number(e.target.value))} className="mt-1 w-full rounded-lg bg-zinc-950 p-3"/></label>
        <button type="button" disabled={saving!==null || !cardName.trim() || !cardDescription.trim()} onClick={createCard} className="rounded-lg bg-cyan-700 px-4 py-2 disabled:opacity-50">Crear efecto</button>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card=><article key={card.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4"><div className="text-2xl">✦</div><input aria-label="Nombre" value={card.name} onChange={e=>setCards(old=>old.map(c=>c.id===card.id?{...c,name:e.target.value}:c))} className="w-full bg-zinc-900 p-2 font-semibold"/><textarea aria-label="Descripción" value={card.description} onChange={e=>setCards(old=>old.map(c=>c.id===card.id?{...c,description:e.target.value}:c))} className="mt-2 w-full bg-zinc-900 p-2 text-sm"/><input aria-label="Precio PCH" type="number" min={0} value={card.pch} onChange={e=>setCards(old=>old.map(c=>c.id===card.id?{...c,pch:Number(e.target.value)}:c))} className="mt-2 w-full bg-zinc-900 p-2 text-cyan-300"/><label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={card.enabled} onChange={e=>setCards(old=>old.map(c=>c.id===card.id?{...c,enabled:e.target.checked}:c))}/>Disponible</label><button type="button" disabled={saving!==null} onClick={()=>saveCard(card)} className="mt-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm disabled:opacity-50">Guardar cambios</button></article>)}</div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Precios PCH por efecto</h2>
        <div className="grid gap-3 sm:grid-cols-2">{effects.filter(e=>(e.label+" "+e.type).toLowerCase().includes(search.toLowerCase())).map(e=>{const p=pricing[e.type];if(!p)return null;return <div key={e.type} className="space-y-3 rounded-xl border border-zinc-700 p-4">
          <strong>{e.label}</strong><p className="text-xs text-zinc-500">{e.type}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Precio base<input type="number" min={0} step={1} value={p.base} onChange={event=>setPricing(old=>({...old,[e.type]:{...old[e.type],base:Number(event.target.value)}}))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 p-2"/></label>
            <label className="text-sm">PCH por escalón<input type="number" min={0} step={1} value={p.step} onChange={event=>setPricing(old=>({...old,[e.type]:{...old[e.type],step:Number(event.target.value)}}))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 p-2"/></label>
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.enabled} onChange={event=>setPricing(old=>({...old,[e.type]:{...old[e.type],enabled:event.target.checked}}))}/>Disponible para nuevas habilidades</label>
          <button type="button" disabled={saving!==null} onClick={()=>savePricing(e.type)} className="rounded bg-cyan-700 px-3 py-2 text-sm disabled:opacity-50">Guardar precio</button>
        </div>})}</div>
      </section>
      {error && <p role="alert" className="rounded-lg border border-red-800 p-3 text-red-300">{error}</p>}
      {loading ? <p className="text-zinc-400">Cargando efectos…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{effects.length}</div><div className="text-sm text-zinc-400">Tipos de efectos</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{statistics.length}</div><div className="text-sm text-zinc-400">Estadísticas activas</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{effects.filter((effect) => effect.targets.length > 0).length}</div><div className="text-sm text-zinc-400">Tipos con objetivos</div></div>
          </div>
          <label className="block text-sm text-zinc-300">Buscar efecto
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tipo, nombre o cálculo" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
          </label>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              {visible.map((effect) => <button key={effect.type} type="button" onClick={() => setSelected(effect.type)} className={"w-full rounded-xl border p-4 text-left " + (selected === effect.type ? "border-cyan-400 bg-zinc-800" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600")}>
                <div className="font-semibold">{effect.label}</div>
                <div className="mt-1 text-xs text-zinc-400">{effect.type} · {modes[effect.mode] ?? effect.mode}</div>
              </button>)}
              {!visible.length && <p className="text-zinc-400">No hay efectos coincidentes.</p>}
            </div>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              {active ? <>
                <h2 className="text-xl font-semibold">{active.label}</h2>
                <p className="mt-2 text-sm text-zinc-400">Código: <code>{active.type}</code></p>
                <p className="mt-1 text-sm text-zinc-400">Operación: {modes[active.mode] ?? active.mode}</p>
                <h3 className="mt-5 font-semibold">Objetivos permitidos ({active.targets.length})</h3>
                {active.targets.length ? <div className="mt-3 flex flex-wrap gap-2">{active.targets.map((target) => <span key={target.key} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">{target.label} <code className="text-xs text-zinc-500">{target.key}</code></span>)}</div> : <p className="mt-2 text-sm text-zinc-400">No requiere seleccionar un objetivo.</p>}
              </> : <p className="text-zinc-400">Selecciona un efecto para revisar sus reglas.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
