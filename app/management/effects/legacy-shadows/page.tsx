"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {LegacyModularShadow} from "@/lib/effects/legacy-modular-shadow";

type Response={
  readonly:boolean;counts:{originals:number;duplicates:number;complete:number;partial:number;unsupported:number};
  duplicates:LegacyModularShadow[];errors:Array<{source:string;id:number;error:string}>;
};
const sourceNames:Record<string,string>={skill:"Personajes",raceSkill:"Raciales",genericSkillTemplate:"Genéricas"};
export default function LegacyShadowGallery(){
  const [data,setData]=useState<Response|null>(null);
  const [error,setError]=useState("");
  const [scope,setScope]=useState("ALL");
  const [coverage,setCoverage]=useState("ALL");
  const [open,setOpen]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/management/effects/legacy-shadows",{signal:controller.signal,cache:"no-store"})
      .then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error??"Error al consultar copias");return body;})
      .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Error");});
    return ()=>controller.abort();
  },[]);
  const filtered=useMemo(()=>data?.duplicates.filter(d=>
    (scope==="ALL"||d.origin.source===scope) && (coverage==="ALL"||d.coverage===coverage))??[],[data,scope,coverage]);
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 text-white">
    <Link href="/management/effects" className="text-sm text-cyan-300">← Gestión de efectos</Link>
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Copias modulares de habilidades existentes</h1>
      <p className="text-sm text-zinc-400">Comparador de solo lectura. Cada copia toma la definición vigente y construye micromódulos equivalentes cuando hay resolutor. No altera el personaje, no crea habilidades adicionales, no descuenta PCH y no activa automáticamente las copias.</p>
    </div>
    {error&&<p role="alert" className="rounded border border-red-700 p-3 text-red-300">{error}</p>}
    {!data&&!error&&<p className="text-zinc-400">Recopilando habilidades…</p>}
    {data&&<>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[["Definiciones",data.counts.originals],["Conversión completa",data.counts.complete],["Parcial",data.counts.partial],["No convertida",data.counts.unsupported]].map(([label,n])=>
          <div key={label} className="rounded-lg border border-zinc-700 p-3"><span className="block text-xs text-zinc-400">{label}</span><strong className="text-2xl">{n}</strong></div>)}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs">Origen<select aria-label="Filtrar origen" className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-2" value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="ALL">Todos</option>{Object.entries(sourceNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select></label>
        <label className="text-xs">Estado<select aria-label="Filtrar cobertura" className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-2" value={coverage} onChange={e=>setCoverage(e.target.value)}>
          <option value="ALL">Todos</option><option value="COMPLETE">Completa</option><option value="PARTIAL">Parcial</option><option value="UNSUPPORTED">Sin equivalencia</option>
        </select></label>
      </div>
      <div className="space-y-3">
        {filtered.map(item=>{
          const token=item.origin.source+":"+item.origin.id;
          const expanded=open===token;
          return <article key={token} className="rounded-xl border border-zinc-700 bg-zinc-900/60">
            <button type="button" onClick={()=>setOpen(expanded?null:token)} aria-expanded={expanded} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left">
              <div><strong className="block">{item.label}</strong>
                <span className="text-xs text-zinc-400">{sourceNames[item.origin.source]} · origen #{item.origin.id} · {item.parts.length} efectos</span>
              </div>
              <span className={"text-xs "+(item.coverage==="COMPLETE"?"text-emerald-300":item.coverage==="PARTIAL"?"text-amber-300":"text-zinc-400")}>
                {item.coverage==="COMPLETE"?"Todas las partes representadas":item.coverage==="PARTIAL"?"Representación parcial":"Necesita nuevos resolutores"} {expanded?"−":"+"}
              </span>
            </button>
            {expanded&&<div className="space-y-3 border-t border-zinc-700 p-4">
              {item.parts.map(part=><section key={part.sourceIndex} className="rounded-lg border border-zinc-800 p-3">
                <h3 className="text-sm font-semibold">{part.sourceType} <span className="text-xs font-normal text-zinc-400">· {part.status==="EXECUTABLE"?"micromódulo generado":part.status==="DESCRIPTION_ONLY"?"solo narrativo":"no convertido"}</span></h3>
                {part.reason&&<p className="mt-2 text-xs text-amber-300">{part.reason}</p>}
                {part.modules.map(module=><div key={module.id} className="mt-2 space-y-2">
                  {module.steps.map((step,i)=><pre key={i} className="overflow-x-auto rounded-lg bg-zinc-950 p-2 text-xs text-cyan-200">{JSON.stringify(step,null,2)}</pre>)}
                </div>)}
              </section>)}
            </div>}
          </article>;
        })}
      </div>
      {data.errors.length>0&&<p className="text-sm text-amber-300">{data.errors.length} definiciones no pudieron clonarse. Consulta el registro de errores del administrador.</p>}
    </>}
  </main>;
}
