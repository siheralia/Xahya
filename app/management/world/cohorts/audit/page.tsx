"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type AuditLocation = {
  locationId: number;
  locationName: string;
  cohortCount: number;
  population: string;
  wealth: string;
  status: "NO_ACTIVE_COHORTS" | "SINGLE_COHORT_REVIEW" | "MULTIPLE_COHORTS";
  duplicateProfiles: number;
};
type AuditResult = {
  readOnly: boolean;
  auditedAt: string;
  totals: {
    locationsAudited: number;
    activeCohorts: number;
    inactiveCohorts: number;
    population: string;
    wealth: string;
    locationsWithoutActiveCohorts: number;
    locationsWithSingleActiveCohort: number;
    locationsWithMultipleActiveCohorts: number;
    duplicateProfileLocations: number;
  };
  interpretation: Record<string, string>;
  locations: AuditLocation[];
};
const fmt = (value: string | number) => {
  try { return BigInt(String(value ?? "0")).toLocaleString("es-MX"); } catch { return String(value ?? "0"); }
};

export default function CohortAuditPage() {
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/management/world/cohorts/audit", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo cargar la auditoría.");
      setData(payload as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la auditoría.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = (data?.locations ?? []).filter((location) => {
    if (filter === "ALL") return true;
    if (filter === "DUPLICATES") return location.duplicateProfiles > 0;
    return location.status === filter;
  });

  const statusLabel = (status: AuditLocation["status"]) => ({
    NO_ACTIVE_COHORTS: "Sin cohortes activas",
    SINGLE_COHORT_REVIEW: "Revisar cohorte única",
    MULTIPLE_COHORTS: "Varias cohortes",
  })[status];
  const statusClass = (status: AuditLocation["status"]) => ({
    NO_ACTIVE_COHORTS: "border-red-900 bg-red-950/30 text-red-300",
    SINGLE_COHORT_REVIEW: "border-amber-900 bg-amber-950/30 text-amber-300",
    MULTIPLE_COHORTS: "border-emerald-900 bg-emerald-950/20 text-emerald-300",
  })[status];

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Link href="/management/world/cohorts" className="text-sm text-zinc-500 hover:text-zinc-300">← Volver a cohortes</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Control de integridad</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Auditoría de cohortes sociales</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Revisión de cobertura poblacional, grupos activos y perfiles potencialmente duplicados por locación. Esta auditoría es de solo lectura: no crea, divide ni modifica población o riqueza.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">{loading ? "Actualizando…" : "Actualizar auditoría"}</button>
    </div>

    {error && <div role="alert" className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
    {loading && !data && <p className="mt-6 text-sm text-zinc-400">Consultando estructura de cohortes…</p>}
    {data && <>
      <p className="mt-4 text-xs text-zinc-500">Última consulta: {new Date(data.auditedAt).toLocaleString("es-MX")} · Solo lectura</p>
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Locaciones auditadas", fmt(data.totals.locationsAudited)],
          ["Cohortes activas", fmt(data.totals.activeCohorts)],
          ["Habitantes representados", fmt(data.totals.population)],
          ["Riqueza agregada", fmt(data.totals.wealth)],
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 break-words text-2xl font-semibold text-white">{value}</p></article>)}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-red-900/70 bg-red-950/20 p-4"><p className="text-sm text-red-300">Sin cohortes activas</p><p className="mt-2 text-2xl font-semibold text-white">{fmt(data.totals.locationsWithoutActiveCohorts)}</p><p className="mt-1 text-xs text-zinc-500">Prioridad para revisar cobertura</p></article>
        <article className="rounded-xl border border-amber-900/70 bg-amber-950/20 p-4"><p className="text-sm text-amber-300">Cohorte única</p><p className="mt-2 text-2xl font-semibold text-white">{fmt(data.totals.locationsWithSingleActiveCohort)}</p><p className="mt-1 text-xs text-zinc-500">Puede ser válida si es una población agregada</p></article>
        <article className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-4"><p className="text-sm text-emerald-300">Varias cohortes</p><p className="mt-2 text-2xl font-semibold text-white">{fmt(data.totals.locationsWithMultipleActiveCohorts)}</p><p className="mt-1 text-xs text-zinc-500">Revisar que los grupos no se solapen</p></article>
        <article className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4"><p className="text-sm text-zinc-300">Posibles perfiles duplicados</p><p className="mt-2 text-2xl font-semibold text-white">{fmt(data.totals.duplicateProfileLocations)}</p><p className="mt-1 text-xs text-zinc-500">Misma raza, ocupación, clase y edad</p></article>
      </section>

      <section className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-white">Detalle por locación</h2><p className="mt-1 text-sm text-zinc-500">Los totales incluyen únicamente cohortes activas.</p></div>
          <select aria-label="Filtrar locaciones" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">
            <option value="ALL">Todas las locaciones</option>
            <option value="NO_ACTIVE_COHORTS">Sin cohortes activas</option>
            <option value="SINGLE_COHORT_REVIEW">Cohorte única</option>
            <option value="MULTIPLE_COHORTS">Varias cohortes</option>
            <option value="DUPLICATES">Con perfiles duplicados</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {rows.map((location) => <article key={location.locationId} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="font-semibold text-white">{location.locationName}</h3><p className="mt-1 text-xs text-zinc-500">ID {location.locationId} · {location.cohortCount} cohorte(s) activa(s)</p></div>
              <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(location.status)}`}>{statusLabel(location.status)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-zinc-500">Habitantes</p><p className="mt-1 text-sm font-medium text-zinc-200">{fmt(location.population)}</p></div>
              <div><p className="text-xs text-zinc-500">Riqueza</p><p className="mt-1 text-sm font-medium text-zinc-200">{fmt(location.wealth)}</p></div>
              <div><p className="text-xs text-zinc-500">Perfiles repetidos</p><p className={`mt-1 text-sm font-medium ${location.duplicateProfiles ? "text-amber-300" : "text-zinc-200"}`}>{location.duplicateProfiles}</p></div>
            </div>
            {location.status === "NO_ACTIVE_COHORTS" && <p className="mt-3 text-sm text-red-300">No se puede asumir que su población sea cero; solo indica que aún no está representada por cohortes activas.</p>}
            {location.status === "SINGLE_COHORT_REVIEW" && <p className="mt-3 text-sm text-amber-200">Confirmar si esta cohorte es un agregado provisional o un grupo social específico antes de dividirla.</p>}
            {location.duplicateProfiles > 0 && <p className="mt-3 text-sm text-amber-200">Hay perfiles con la misma combinación de raza, ocupación, clase social y edad. La coincidencia es una señal para revisar, no una prueba de duplicación.</p>}
          </article>)}
          {rows.length === 0 && <p className="rounded-lg border border-zinc-800 p-5 text-sm text-zinc-500">No hay locaciones para este filtro.</p>}
        </div>
      </section>
      <section className="mt-6 rounded-xl border border-zinc-800 p-4">
        <h2 className="font-semibold text-white">Cómo interpretar esta auditoría</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
          <li>{data.interpretation.NO_ACTIVE_COHORTS}</li>
          <li>{data.interpretation.SINGLE_COHORT_REVIEW}</li>
          <li>{data.interpretation.MULTIPLE_COHORTS}</li>
          <li>{data.interpretation.duplicateProfiles}</li>
        </ul>
        <p className="mt-4 text-sm text-zinc-300">Siguiente acción recomendada: revisar primero las locaciones sin cohortes activas y las cohortes únicas; después definir una distribución social documentada, sin alterar automáticamente población ni riqueza.</p>
      </section>
    </>}
  </main>;
}
