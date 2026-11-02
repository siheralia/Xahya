"use client";
import {useEffect,useState} from "react";

type Entry={
 id:number;name:string;description:string|null;category:string;cost:number;
 pchCost:number;totalPch:number;parentTemplateId:number|null;requiresElement:boolean;
 alreadyOwned:boolean;hasBase:boolean;canPurchase:boolean;
 effects:{type:string;target?:string;element?:string;value?:number}[];
};
type Catalog={templates:Entry[];elements:{key:string;name:string}[];pchBalance:number};
export function GenericSkillShop({
 characterId,open,onClose,onCreateCustom,onPurchased,
}:{
 characterId:number;open:boolean;onClose:()=>void;onCreateCustom:()=>void;
 onPurchased:(data:{skill:any;pchBalance:number;pchCost:number;evolved:boolean})=>void;
}){
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState<number|null>(null);
 const [error,setError]=useState("");
 const [chosen,setChosen]=useState<Record<number,string>>({});
 const [search,setSearch]=useState("");
 useEffect(()=>{
  if(!open)return;
  let cancelled=false;
  setLoading(true);setError("");
  fetch("/api/characters/"+characterId+"/generic-skills",{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??"No se pudo abrir el catálogo.");return d as Catalog;})
   .then(d=>{if(!cancelled)setCatalog(d);})
   .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"Error al cargar el catálogo.");})
   .finally(()=>{if(!cancelled)setLoading(false);});
  return ()=>{cancelled=true};
 },[open,characterId]);
 async function purchase(entry:Entry){
  if(busy!==null||entry.alreadyOwned||!entry.hasBase||!entry.canPurchase)return;
  setBusy(entry.id);setError("");
  try{
   const element=entry.requiresElement?(chosen[entry.id]??catalog?.elements[0]?.key):undefined;
   if(entry.requiresElement&&!element)throw new Error("No hay elementos disponibles para esta técnica.");
   const r=await fetch("/api/characters/"+characterId+"/generic-skills",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({templateId:entry.id,...(element?{element}:{})}),
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error??"No se pudo comprar la habilidad.");
   onPurchased(d);
   onClose();
  }catch(e){setError(e instanceof Error?e.message:"Error de compra.");}
  finally{setBusy(null);}
 }
 if(!open)return null;
 const visible=(catalog?.templates??[]).filter(t=>(t.name+" "+(t.description??"")).toLowerCase().includes(search.toLowerCase()));
 return <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Adquirir habilidades genéricas" className="max-h-[92vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-cyan-700/60 bg-zinc-950 p-5 text-white shadow-xl">
   <div className="flex items-start justify-between gap-3">
    <div><h2 className="text-xl font-bold">Usar PCH de habilidad</h2>
     <p className="mt-1 text-sm text-zinc-400">Compra una técnica genérica aprobada o crea una habilidad propia. Las monedas siguen concediendo 10 PCH.</p></div>
    <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <button type="button" onClick={onCreateCustom} className="rounded-xl border border-violet-600/50 p-4 text-left hover:bg-violet-950/20">
     <b>Crear habilidad personalizada</b><p className="mt-1 text-xs text-zinc-400">Abre el constructor habitual y solicita aprobación.</p>
    </button>
    <div className="rounded-xl border border-cyan-700/50 p-4">
     <b>Comprar habilidad genérica</b><p className="mt-1 text-xs text-zinc-400">Se adquiere aprobada automáticamente tras pagar el coste indicado.</p>
    </div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="font-medium text-cyan-300">Saldo PCH: {catalog?.pchBalance??"—"} {catalog && catalog.pchBalance<0?"(deuda pendiente)":""}</p>
    <input aria-label="Buscar genéricas" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar técnica..." className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm sm:w-60"/>
   </div>
   {error&&<p role="alert" className="rounded-lg border border-red-800 p-3 text-sm text-red-300">{error}</p>}
   {loading?<p className="py-5 text-sm text-zinc-400">Cargando habilidades genéricas…</p>:
   visible.length===0?<p className="rounded-lg border border-zinc-800 p-5 text-sm text-zinc-400">No hay técnicas publicadas que coincidan. Puedes crear tu propia habilidad.</p>:
   <div className="grid gap-3 sm:grid-cols-2">{visible.map(entry=><div key={entry.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div className="flex items-start justify-between gap-2">
     <div><h3 className="font-semibold">{entry.name}</h3><p className="text-xs text-zinc-500">{entry.category} · {entry.cost} maná por uso</p></div>
     <span className="shrink-0 font-semibold text-cyan-300">{entry.pchCost} PCH</span>
    </div>
    <p className="text-sm text-zinc-300">{entry.description}</p>
    {entry.parentTemplateId!==null&&<p className="text-xs text-violet-300">Evolución: solo se cobra el coste adicional. Precio total {entry.totalPch} PCH.</p>}
    {catalog && entry.canPurchase && catalog.pchBalance<entry.pchCost && <p className="text-xs text-amber-300">Saldo tras comprar: {catalog.pchBalance-entry.pchCost} PCH (deuda).</p>}
    {entry.requiresElement&&<label className="block text-sm text-zinc-400">Elemento de imbuición
     <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2" value={chosen[entry.id]??catalog?.elements[0]?.key??""} onChange={e=>setChosen(v=>({...v,[entry.id]:e.target.value}))}>
      {catalog?.elements.map(e=><option key={e.key} value={e.key}>{e.name}</option>)}
     </select>
    </label>}
    <button type="button" onClick={()=>void purchase(entry)}
     disabled={busy!==null||entry.alreadyOwned||!entry.hasBase||!entry.canPurchase||(entry.requiresElement&&!catalog?.elements.length)}
     className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">
     {busy===entry.id?"Comprando…":entry.alreadyOwned?"Ya adquirida":!entry.hasBase?"Primero adquiere la habilidad base":!entry.canPurchase?"Sin PCH a favor":entry.parentTemplateId!==null?"Evolucionar · "+entry.pchCost+" PCH":"Adquirir · "+entry.pchCost+" PCH"}
    </button>
   </div>)}</div>}
  </section>
 </div>;
}
