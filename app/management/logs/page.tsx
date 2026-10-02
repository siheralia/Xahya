"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Log = {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  characterId: number | null;
  actor: { id: number; name: string; role: string } | null;
  targetUserId: number | null;
  characterName: string | null;
  businessName: string | null;
  position: { id: number; title: string; startTime: string; endTime: string; salary: number; salaryFrequency: string; payerType: string; payerCharacterId: number | null } | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

const eventTypes = ["Todos","Personaje","Estadísticas","Recursos","Level Up","Karma","Sistema"];
const ranges = [
  ["today","Hoy"],
  ["7d","Últimos 7 días"],
  ["30d","Últimos 30 días"],
  ["all","Todo"],
] as const;

const actionLabels: Record<string,string> = {
  CHARACTER_CREATED:"Creó personaje", CHARACTER_RENAME:"Renombró personaje",
  CHARACTER_DELETE:"Eliminó personaje", CHARACTER_TRANSFER:"Transfirió personaje",
  STAT_UPDATE:"Modificó estadísticas", RESOURCE_GRANT:"Entregó recursos",
  GLOBAL_REWARD:"Entrega global", LEVEL_UP:"Gastó Level Up",
  KARMA_BOOST:"Aplicó boost de Karma", USER_ROLE_CHANGE:"Cambió rol",
  USER_DELETE:"Eliminó usuario",
  CASINO_ROULETTE:"Jugó ruleta", CASINO_BLACKJACK:"Jugó Blackjack", CASINO_DICE:"Jugó dados",
  EMPLOYMENT_CREATE:"Contrató personaje", EMPLOYMENT_END:"Terminó contrato",
  BUSINESS_CREATE:"Creó negocio", BUSINESS_UPDATE:"Modificó negocio",
  BUSINESS_POSITION_CREATE:"Creó puesto", BUSINESS_POSITION_UPDATE:"Modificó puesto",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
}
function money(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

function detailText(log: Log) {
  const d = log.details;
  if (!d) return "";
  if (log.action === "EMPLOYMENT_CREATE" && log.position) {
    const salary = `${money(log.position.salary)} / ${log.position.salaryFrequency === "WEEKLY" ? "semana" : "día"}`;
    const payer = log.position.payerType === "CHARACTER" ? "personaje" : "negocio/sistema";
    return `Puesto: ${log.position.title} · Turno: ${log.position.startTime}–${log.position.endTime} · Salario: ${salary} · Pagador: ${payer}`;
  }
  if (log.action === "EMPLOYMENT_END" && log.position) return `Puesto: ${log.position.title} · Turno: ${log.position.startTime}–${log.position.endTime}`;
  if (log.action.startsWith("BUSINESS_")) {
    const parts = [];
    if (d.name !== undefined) parts.push(`Nombre: ${String(d.name)}`);
    if (d.ownerCharacterId !== undefined) parts.push(`Propietario ID: ${String(d.ownerCharacterId)}`);
    if (d.positionId !== undefined) parts.push(`Puesto #${String(d.positionId)}`);
    if (d.salary !== undefined) parts.push(`Salario: ${money(Number(d.salary))}`);
    return parts.join(" · ");
  }
  if (d.before !== undefined && d.after !== undefined && typeof d.before !== "object") return `${String(d.before)} → ${String(d.after)}`;
  if (d.amount !== undefined) return `Cantidad: ${String(d.amount)}`;
  if (d.bet !== undefined) return `Apuesta: ${String(d.bet)}`;
  if (d.roll !== undefined) return `Tirada: ${String(d.roll)}`;
  if (d.spent !== undefined) return `Gastado: ${String(d.spent)}`;
  return "";
}

export default function ManagementLogsPage() {
  const [type,setType]=useState("Todos");
  const [search,setSearch]=useState("");
  const [range,setRange]=useState("all");
  const [page,setPage]=useState(1);
  const [logs,setLogs]=useState<Log[]>([]);
  const [summary,setSummary]=useState({events:0,users:0,latest:null as string|null});
  const [pages,setPages]=useState(1);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    const timer=setTimeout(async()=>{
      setLoading(true); setError("");
      try {
        const params=new URLSearchParams({search,type,range,page:String(page),limit:"50"});
        const response=await fetch(`/api/management/logs?${params}`,{cache:"no-store"});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error || "No se pudieron cargar los logs.");
        setLogs(data.items ?? []);
        setSummary(data.summary ?? {events:0,users:0,latest:null});
        setPages(data.pagination?.pages ?? 1);
      } catch(e) { setError(e instanceof Error ? e.message : "No se pudieron cargar los logs."); }
      finally { setLoading(false); }
    },250);
    return ()=>clearTimeout(timer);
  },[search,type,range,page]);

  function changeType(value:string){setType(value);setPage(1)}
  function changeRange(value:string){setRange(value);setPage(1)}

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">← Gestión</Link>
            <h1 className="mt-6 text-4xl font-bold">Logs del sistema</h1>
            <p className="mt-2 text-zinc-500">Auditoría persistente de las acciones realizadas dentro de Xahya.</p>
          </div>
          <Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">← Inicio</Link>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="text-sm text-zinc-400">Buscar</span>
              <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Usuario, personaje o acción..." className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"/>
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Tipo de evento</span>
              <select value={type} onChange={e=>changeType(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500">
                {eventTypes.map(x=><option key={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {ranges.map(([value,label])=><button key={value} type="button" onClick={()=>changeRange(value)} className={`rounded-full border px-3 py-1.5 text-xs transition ${range===value ? "border-zinc-500 bg-zinc-800 text-white":"border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"}`}>{label}</button>)}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-6 py-4">
            <h2 className="font-semibold">Actividad</h2>
            <span className="text-xs text-zinc-500">{summary.events} eventos encontrados</span>
          </div>

          {loading ? <div className="px-6 py-16 text-center text-sm text-zinc-500">Cargando auditoría…</div>
          : error ? <div className="px-6 py-16 text-center"><p className="text-sm text-red-400">{error}</p></div>
          : logs.length===0 ? <div className="px-6 py-16 text-center"><h3 className="font-medium text-zinc-300">No hay eventos</h3><p className="mt-2 text-sm text-zinc-500">No existen auditorías que coincidan con los filtros actuales.</p></div>
          : <div className="divide-y divide-zinc-800/80">
              {logs.map(log=><article key={log.id} className="px-6 py-5 transition hover:bg-zinc-900/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-200">{actionLabels[log.action] ?? log.action}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {log.actor?.name ?? "Sistema"} <span className="text-zinc-700">·</span> {log.actor?.role ?? "SYSTEM"}
                      {log.characterName ? <><span className="text-zinc-700"> · </span><span className="text-zinc-300">{log.characterName}</span></> : null}
                      {log.businessName ? <><span className="text-zinc-700"> · </span><span className="text-zinc-300">{log.businessName}</span></> : null}
                    </p>
                    {detailText(log) ? <p className="mt-2 text-xs leading-5 text-zinc-500">{detailText(log)}</p> : null}
                  </div>
                  <time className="shrink-0 text-xs text-zinc-600">{formatDate(log.createdAt)}</time>
                </div>
              </article>)}
            </div>}

          {!loading && pages>1 ? <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
            <button type="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 disabled:opacity-30">← Anterior</button>
            <span className="text-xs text-zinc-500">Página {page} de {pages}</span>
            <button type="button" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 disabled:opacity-30">Siguiente →</button>
          </div> : null}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"><p className="text-xs uppercase tracking-wider text-zinc-600">Eventos</p><p className="mt-2 text-2xl font-semibold">{summary.events}</p></div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"><p className="text-xs uppercase tracking-wider text-zinc-600">Usuarios activos</p><p className="mt-2 text-2xl font-semibold">{summary.users}</p></div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"><p className="text-xs uppercase tracking-wider text-zinc-600">Último evento</p><p className="mt-2 text-sm font-medium text-zinc-300">{summary.latest ? formatDate(summary.latest) : "—"}</p></div>
        </section>
      </div>
    </main>
  );
}
