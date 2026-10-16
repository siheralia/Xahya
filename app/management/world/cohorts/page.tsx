"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string; type: string; publicationStatus: string };
type Cohort = {
  id: number; locationId: number; locationName: string; name: string; race: string; occupation: string;
  socialClass: string; ageGroup: string; population: string; wealth: string; birthRate: number;
  deathRate: number; migrationRate: number; productivity: number; consumption: number; active: boolean;
};
type FormState = Omit<Cohort, "id" | "locationName"> & { id: number | null };
const blank: FormState = {
  id: null, locationId: 0, name: "", race: "Sin especificar", occupation: "Sin especificar",
  socialClass: "Sin especificar", ageGroup: "Mixta", population: "0", wealth: "0",
  birthRate: 0.012, deathRate: 0.008, migrationRate: 0, productivity: 1, consumption: 1, active: true,
};
const fmt = (value: string | number) => {
  const text = String(value ?? "0");
  try { return BigInt(text).toLocaleString("es-MX"); } catch { return text; }
};
const typeLabel = (value: string) => ({
  CONTINENT: "Continente", REGION: "Región", CITY: "Ciudad", ISLAND: "Isla",
  ARCHIPELAGO: "Archipiélago", FLOATING_ISLAND: "Isla flotante", NEIGHBORHOOD: "Barrio",
  BUILDING: "Edificio", POINT_OF_INTEREST: "Punto de interés",
} as Record<string, string>)[value] ?? value;

export default function WorldCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<FormState>(blank);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/management/world/cohorts", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las cohortes.");
      setCohorts(Array.isArray(data.cohorts) ? data.cohorts : []);
      setLocations(Array.isArray(data.locations) ? data.locations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las cohortes.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return cohorts.filter((cohort) => {
      const matchesTerm = !term || [cohort.name, cohort.locationName, cohort.race, cohort.occupation, cohort.socialClass, cohort.ageGroup]
        .some((value) => String(value ?? "").toLocaleLowerCase("es").includes(term));
      return matchesTerm && (locationFilter === "ALL" || String(cohort.locationId) === locationFilter);
    });
  }, [cohorts, search, locationFilter]);

  const totalPopulation = cohorts.reduce((sum, cohort) => sum + BigInt(cohort.population || "0"), BigInt(0));
  const totalWealth = cohorts.reduce((sum, cohort) => sum + BigInt(cohort.wealth || "0"), BigInt(0));

  function edit(cohort: Cohort) {
    setForm({ ...cohort, id: cohort.id });
    setError(""); setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() { setForm(blank); setError(""); setSuccess(""); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/cohorts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, action: form.id === null ? "create" : "update" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la cohorte.");
      setSuccess(form.id === null ? "Cohorte creada." : "Cohorte actualizada.");
      reset();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la cohorte."); }
    finally { setSaving(false); }
  }

  async function remove(cohort: Cohort) {
    if (!window.confirm(`¿Eliminar la cohorte “${cohort.name}”? Esta acción no se puede deshacer.`)) return;
    setDeleting(cohort.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/cohorts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: cohort.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar la cohorte.");
      setSuccess("Cohorte eliminada.");
      if (form.id === cohort.id) reset();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar la cohorte."); }
    finally { setDeleting(null); }
  }

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-6">
      <Link href="/management/world" className="text-sm text-zinc-500 hover:text-zinc-300">← Gestión del mundo</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Población y economía territorial</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Cohortes de población</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Representa poblaciones enormes con grupos agregados, no con una fila por habitante. Cada cohorte conserva su locación, demografía, riqueza y parámetros para las futuras simulaciones.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
          <span className="block text-2xl font-semibold text-white">{cohorts.length}</span>cohortes
          <span className="mt-2 block text-lg font-semibold text-white">{fmt(String(totalPopulation))}</span>habitantes representados
        </div>
      </div>
    </div>

    {error && <div role="alert" className="mb-4 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
    {success && <div role="status" className="mb-4 rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-4 text-sm text-emerald-300">{success}</div>}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-white">{form.id === null ? "Crear cohorte" : `Editar cohorte #${form.id}`}</h2>
          <p className="mt-1 text-sm text-zinc-500">La población y riqueza admiten números mayores que el límite de un entero de 32 bits.</p></div>
        {form.id !== null && <button type="button" onClick={reset} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancelar edición</button>}
      </div>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block"><span className="text-sm text-zinc-300">Nombre de la cohorte *</span><input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Comerciantes humanos del puerto" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Locación *</span><select required value={String(form.locationId || "")} onChange={(e) => setForm({ ...form, locationId: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"><option value="">Seleccionar locación</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {typeLabel(location.type)}{location.publicationStatus === "DRAFT" ? " · Borrador" : ""}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Raza / especie</span><input maxLength={120} value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Ocupación principal</span><input maxLength={120} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Clase social</span><input maxLength={120} value={form.socialClass} onChange={(e) => setForm({ ...form, socialClass: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Grupo de edad</span><input maxLength={120} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Población (habitantes) *</span><input required inputMode="numeric" pattern="[0-9]+" value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Riqueza agregada *</span><input required inputMode="numeric" pattern="[0-9]+" value={form.wealth} onChange={(e) => setForm({ ...form, wealth: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Natalidad anual (0–1)</span><input type="number" min="0" max="1" step="0.001" value={form.birthRate} onChange={(e) => setForm({ ...form, birthRate: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Mortalidad anual (0–1)</span><input type="number" min="0" max="1" step="0.001" value={form.deathRate} onChange={(e) => setForm({ ...form, deathRate: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Migración neta anual (-1 a 1)</span><input type="number" min="-1" max="1" step="0.001" value={form.migrationRate} onChange={(e) => setForm({ ...form, migrationRate: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Productividad por habitante</span><input type="number" min="0" step="0.1" value={form.productivity} onChange={(e) => setForm({ ...form, productivity: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="block"><span className="text-sm text-zinc-300">Consumo por habitante</span><input type="number" min="0" step="0.1" value={form.consumption} onChange={(e) => setForm({ ...form, consumption: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="flex items-center gap-3 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Cohorte activa</label>
        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={saving} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-50">{saving ? "Guardando…" : form.id === null ? "Crear cohorte" : "Guardar cambios"}</button>{form.id === null && <button type="button" onClick={reset} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300">Limpiar</button>}</div>
      </form>
    </section>

    <section className="mt-7">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cohorte, locación, raza u ocupación…" className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-white" /><select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-white"><option value="ALL">Todas las locaciones</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
      {loading ? <p className="py-12 text-center text-sm text-zinc-500">Cargando cohortes…</p> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center"><p className="font-medium text-zinc-300">{cohorts.length ? "No hay resultados" : "Aún no hay cohortes"}</p><p className="mt-2 text-sm text-zinc-500">{cohorts.length ? "Cambia los filtros de búsqueda." : "Crea la primera cohorte para empezar a representar la población de una ciudad o región."}</p></div> :
      <div className="grid gap-3">{filtered.map((cohort) => <article key={cohort.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{cohort.name}</h3><span className={`rounded-full border px-2 py-0.5 text-xs ${cohort.active ? "border-emerald-800 text-emerald-300" : "border-zinc-700 text-zinc-500"}`}>{cohort.active ? "Activa" : "Pausada"}</span></div><p className="mt-1 text-sm text-cyan-300">{cohort.locationName}</p><p className="mt-2 text-sm text-zinc-400">{cohort.race} · {cohort.occupation} · {cohort.socialClass} · {cohort.ageGroup}</p></div><div className="flex gap-2"><button type="button" onClick={() => edit(cohort)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Editar</button><button type="button" disabled={deleting === cohort.id} onClick={() => void remove(cohort)} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-50">{deleting === cohort.id ? "Eliminando…" : "Eliminar"}</button></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg bg-zinc-950/70 p-3"><p className="text-xs text-zinc-500">Habitantes</p><p className="mt-1 text-lg font-semibold text-white">{fmt(cohort.population)}</p></div><div className="rounded-lg bg-zinc-950/70 p-3"><p className="text-xs text-zinc-500">Riqueza</p><p className="mt-1 text-lg font-semibold text-white">{fmt(cohort.wealth)}</p></div><div className="rounded-lg bg-zinc-950/70 p-3"><p className="text-xs text-zinc-500">Natalidad / mortalidad</p><p className="mt-1 text-sm font-medium text-white">{(cohort.birthRate * 100).toFixed(1)}% / {(cohort.deathRate * 100).toFixed(1)}%</p></div><div className="rounded-lg bg-zinc-950/70 p-3"><p className="text-xs text-zinc-500">Migración neta</p><p className="mt-1 text-sm font-medium text-white">{(cohort.migrationRate * 100).toFixed(1)}%</p></div></div>
      </article>)}</div>}
    </section>
    <p className="mt-6 text-xs leading-5 text-zinc-600">Esta primera entrega guarda cohortes persistentes y sus parámetros. Todavía no ejecuta cambios demográficos automáticos ni mueve riqueza: el motor de simulación se conectará como siguiente paso y registrará cada ciclo para evitar duplicarlo.</p>
  </main>;
}
