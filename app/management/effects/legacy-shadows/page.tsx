"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {LegacyModularShadow} from "@/lib/effects/legacy-modular-shadow";
import type {ModularCutoverSetting,ModularCutoverMode} from "@/lib/effects/modular-cutover";
import {MicroEffectFlowEditor} from "@/components/effects/MicroEffectFlowEditor";
import {GLORIA_MICRO_PRESETS} from "@/lib/effects/micro-template-presets";

type Response={
  readonly:boolean;counts:{originals:number;duplicates:number;represented:number;complete:number;partial:number;unsupported:number};
  duplicates:LegacyModularShadow[];errors:Array<{source:string;id:number;error:string}>;
};
const sourceNames:Record<string,string>={skill:"Personajes",raceSkill:"Raciales",genericSkillTemplate:"Genéricas"};
export default function LegacyShadowGallery(){
  const [data,setData]=useState<Response|null>(null);
  const [error,setError]=useState("");
  const [scope,setScope]=useState("ALL");
  const [coverage,setCoverage]=useState("ALL");
  const [open,setOpen]=useState<string|null>(null);
  const [gloriaOpen,setGloriaOpen]=useState(3);
  const [cutover,setCutover]=useState<ModularCutoverSetting|null>(null);
  const [savingMode,setSavingMode]=useState(false);
  const [environment,setEnvironment]=useState("local");
  const [modeError,setModeError]=useState("");
  const changeMode=async(mode:ModularCutoverMode)=>{
    if(!cutover||savingMode||mode===cutover.mode)return;
    setSavingMode(true);setModeError("");
    try{
      const response=await fetch("/api/management/effects/modular-cutover",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode,expectedRevision:cutover.revision}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"No se pudo cambiar el modo.");
      setCutover(result.setting);
    }catch(e){setModeError(e instanceof Error?e.message:"Error de configuración");}
    finally{setSavingMode(false);}
  };
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/management/effects/legacy-shadows",{signal:controller.signal,cache:"no-store"})
      .then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error??"Error al consultar copias");return body;})
      .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Error");});
    fetch("/api/management/effects/modular-cutover",{signal:controller.signal,cache:"no-store"})
      .then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error??"Sin permiso de migración");return body;})
      .then(body=>{setCutover(body.setting);setEnvironment(body.environment??"local");})
      .catch(e=>{if(!controller.signal.aborted)setModeError(e instanceof Error?e.message:"Error");});
    return ()=>controller.abort();
  },[]);
  const filtered=useMemo(()=>data?.duplicates.filter(d=>
    (scope==="ALL"||d.origin.source===scope) && (coverage==="ALL"||d.coverage===coverage))??[],[data,scope,coverage]);
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 text-white">
    <Link href="/management/effects" className="text-sm text-cyan-300">← Gestión de efectos</Link>
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Copias modulares de habilidades existentes</h1>
      <div className="flex flex-wrap gap-2">
        <Link href="/management/effects/modules" className="inline-flex rounded-lg bg-cyan-700 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-600">Crear y conectar efectos en React Flow</Link>
        <Link href="#gloria-presets" className="inline-flex rounded-lg border border-amber-600 px-4 py-3 text-sm text-amber-200">Ver las habilidades de Gloria</Link>
      </div>
      <p className="text-sm text-zinc-400">Migración masiva con respaldo automático: las definiciones originales se conservan en la base de datos. Los valores equivalentes usan micromódulos; los casos todavía no resueltos mantienen el motor clásico. Puedes revisar cada copia visualmente sin comprarla ni pagar PCH.</p>
      <section className="rounded-xl border border-cyan-900 bg-zinc-900/70 p-4">
        <h2 className="font-semibold">Motor para lanzar habilidades en combate</h2>
        <p className="mt-1 text-sm text-zinc-400">El cambio se aplica al próximo lanzamiento; no altera habilidades, saldos de PCH ni encuentros ya resueltos. La reversión afecta al cálculo de lanzamientos; las pasivas del laberinto y otras rutas conservan sus adaptadores existentes.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!cutover||savingMode} onClick={()=>changeMode("MODULAR_FIRST")}
            className={"rounded-lg border px-3 py-2 text-sm disabled:opacity-40 "+(cutover?.mode==="MODULAR_FIRST"?"border-emerald-500 bg-emerald-950 text-emerald-200":"border-zinc-600 text-zinc-300")}>
            Priorizar módulos con respaldo
          </button>
          <button type="button" disabled={!cutover||savingMode} onClick={()=>changeMode("LEGACY_ONLY")}
            className={"rounded-lg border px-3 py-2 text-sm disabled:opacity-40 "+(cutover?.mode==="LEGACY_ONLY"?"border-amber-500 bg-amber-950 text-amber-200":"border-zinc-600 text-zinc-300")}>
            Volver al cálculo original
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">{cutover?"Modo: "+(cutover.mode==="MODULAR_FIRST"?"Modular preferido, con fallback":"Motor clásico")+
          " · Revisión "+cutover.revision+" · "+(environment==="production"?"Producción":"Pruebas aisladas de producción"):"Consultando configuración…"}</p>
        {modeError&&<p role="alert" className="mt-2 text-sm text-rose-300">{modeError}</p>}
      </section>
    </div>
    <section id="gloria-presets" className="space-y-3 rounded-xl border border-amber-800/70 bg-zinc-900/60 p-4">
      <h2 className="text-lg font-semibold">Gloria · composiciones modulares</h2>
      <p className="text-sm text-zinc-400">Aquí están los cinco ejemplos de Gracia divina, Santuario Interior y Retribución divina. Estos ejemplos no son habilidades adicionales aprobadas para un personaje: puedes examinarlos y abrirlos como borradores en el constructor.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {GLORIA_MICRO_PRESETS.map((preset,i)=><button key={preset.effect.id} type="button"
          onClick={()=>setGloriaOpen(i)} aria-expanded={gloriaOpen===i}
          className={"rounded-lg border p-3 text-left text-sm "+(gloriaOpen===i?"border-amber-400 bg-amber-950/30 text-amber-100":"border-zinc-700 bg-zinc-950 text-zinc-300")}>
          {preset.label}
        </button>)}
      </div>
      <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">{GLORIA_MICRO_PRESETS[gloriaOpen].effect.name}</h3>
            <p className="max-w-xl text-xs text-zinc-400">{GLORIA_MICRO_PRESETS[gloriaOpen].effect.description}</p>
          </div>
          <Link href={"/management/effects/modules?preset="+gloriaOpen}
            className="rounded-lg border border-cyan-600 px-3 py-2 text-xs text-cyan-200">Editar este ejemplo en el constructor</Link>
        </div>
        <MicroEffectFlowEditor key={GLORIA_MICRO_PRESETS[gloriaOpen].effect.id}
          value={GLORIA_MICRO_PRESETS[gloriaOpen].effect} onChange={()=>{}} readOnly/>
      </div>
    </section>
    {error&&<p role="alert" className="rounded border border-red-700 p-3 text-red-300">{error}</p>}
    {!data&&!error&&<p className="text-zinc-400">Recopilando habilidades…</p>}
    {data&&<>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[["Definiciones",data.counts.originals],["Con módulo",data.counts.represented],["Mecánica completa",data.counts.complete],["Pendiente de resolutor",data.counts.partial+data.counts.unsupported]].map(([label,n])=>
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
                <span className="text-xs text-zinc-400">{sourceNames[item.origin.source]} · origen #{item.origin.id} · {item.parts.length} efectos · {item.represented?"Con micromódulos":"Representación incompleta"}</span>
              </div>
              <span className={"text-xs "+(item.coverage==="COMPLETE"?"text-emerald-300":item.coverage==="PARTIAL"?"text-amber-300":"text-zinc-400")}>
                {item.coverage==="COMPLETE"?"Cálculos representados":item.coverage==="PARTIAL"?"Cálculo parcial; conserva respaldo":"Pendiente de resolutores"} {expanded?"−":"+"}
              </span>
            </button>
            {expanded&&<div className="space-y-3 border-t border-zinc-700 p-4">
              <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                <h3 className="mb-2 text-sm font-semibold">Reglas de la habilidad</h3>
                <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded bg-zinc-800 px-2 py-1">{item.rules.category??"Sin categoría"}</span>
                  {item.rules.duration&&<span className="rounded bg-zinc-800 px-2 py-1">Duración: {item.rules.duration}</span>}
                  {item.rules.cooldown&&<span className="rounded bg-zinc-800 px-2 py-1">Reutilización: {item.rules.cooldown}</span>}
                  {item.rules.condition&&<span className="rounded bg-zinc-800 px-2 py-1">Condición: {item.rules.condition}</span>}
                </div>
                <details className="mt-2 text-xs text-zinc-400">
                  <summary className="cursor-pointer">Ver la definición técnica original</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-cyan-200">{JSON.stringify(item.rules,null,2)}</pre>
                </details>
              </div>
              {item.parts.map(part=><section key={part.sourceIndex} className="rounded-lg border border-zinc-800 p-3">
                <h3 className="text-sm font-semibold">{part.sourceType} <span className="text-xs font-normal text-zinc-400">· {part.status==="EXECUTABLE"?"cálculo numérico disponible":part.status==="DESCRIPTION_ONLY"?"declarativo, falta resolutor":"respaldo clásico / pendiente"}</span></h3>
                {part.reason&&<p className="mt-2 text-xs text-amber-300">{part.reason}</p>}
                {part.modules.map(module=><div key={module.id} className="mt-2 space-y-2">
                  <MicroEffectFlowEditor value={module} readOnly onChange={()=>{}}/>
                  <details className="rounded border border-zinc-700 p-2">
                    <summary className="cursor-pointer text-xs text-zinc-400">Datos técnicos de la copia modular</summary>
                    <pre className="mt-2 overflow-x-auto text-xs text-cyan-200">{JSON.stringify(module.steps,null,2)}</pre>
                  </details>
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
