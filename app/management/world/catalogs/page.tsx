"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Entry = { id: number; name: string; description: string | null; active: boolean };
type CatalogType = "occupation" | "socialClass";
const labels: Record<CatalogType, string> = { occupation: "Ocupaciones", socialClass: "Clases sociales" };
const empty = { id: null as number | null, name: "", description: "", active: true };

export default function WorldPopulationCatalogsPage() {
  const [type, setType] = useState<CatalogType>("occupation");
  const [occupations, setOccupations] = useState<Entry[]>([]);
  const [socialClasses, setSocialClasses] = useState<Entry[]>([]);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/management/world/catalogs", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los catálogos.");
      setOccupations(data.occupations ?? []);
      setSocialClasses(data.socialClasses ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar catálogos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const entries = type === "occupation" ? occupations : socialClasses;
  function edit(entry: Entry) { setForm({ id: entry.id, name: entry.name, description: entry.description ?? "", active: entry.active }); setError(""); setSuccess(""); }
  function reset() { setForm(empty); setError(""); setSuccess(""); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/catalogs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action: form.id === null ? "create" : "update", ...form }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar.");
      setSuccess(form.id === null ? "Registro creado." : "Registro actualizado.");
      reset(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function remove(entry: Entry) {
    if (!window.confirm("¿Eliminar «" + entry.name + "»? Las cohortes conservarán su texto histórico y quedarán sin esa referencia de catálogo.")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/catalogs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action: "delete", id: entry.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar.");
      setSuccess("Registro eliminado."); if (form.id === entry.id) reset(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo eliminar."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-6xl px-4 py-8 text-white sm:px-6">
    <Link href="/management/world" className="text-sm text-zinc-500 hover:text-cyan-300">← Gestión del mundo</Link>
    <header className="mt-4"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Catálogos de población</p><h1 className="mt-2 text-3xl font-bold">Ocupaciones y clases sociales</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Catálogos canónicos para las cohortes. Los cambios de nombre no dependen de texto libre y las referencias se conservan mediante IDs.</p></header>
    <nav className="mt-6 flex flex-wrap gap-2">
      <Link href="/management/races" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Gestionar razas ↗</Link>
      <Link href="/management/world/cohorts" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cohortes ↗</Link>
    </nav>
    <div className="mt-6 flex flex-wrap gap-2">{(["occupation", "socialClass"] as CatalogType[]).map((key) => <button key={key} onClick={() => { setType(key); reset(); }} className={"rounded-lg px-4 py-2 text-sm font-semibold " + (type === key ? "bg-cyan-300 text-zinc-950" : "border border-zinc-700 text-zinc-300")}>{labels[key]} ({(key === "occupation" ? occupations : socialClasses).length})</button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
    {success && <p role="status" className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{success}</p>}
    <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={save} className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-lg font-semibold">{form.id === null ? "Nuevo registro" : "Editar registro"}</h2>
        <label className="mt-4 block text-sm text-zinc-300">Nombre<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="mt-4 block text-sm text-zinc-300">Descripción<textarea maxLength={1000} rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" /></label>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Disponible para nuevas cohortes</label>
        <div className="mt-5 flex gap-2"><button disabled={busy} className="rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50">{busy ? "Guardando…" : form.id === null ? "Crear" : "Guardar"}</button><button type="button" onClick={reset} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm">Limpiar</button></div>
      </form>
      <div className="space-y-3">{loading ? <p className="py-8 text-center text-sm text-zinc-500">Cargando…</p> : entries.map(entry => <article key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{entry.name}</h3><p className="mt-1 text-xs text-zinc-500">ID {entry.id} · {entry.active ? "Activo" : "Inactivo"}</p>{entry.description && <p className="mt-2 text-sm text-zinc-400">{entry.description}</p>}</div><div className="flex gap-2"><button onClick={() => edit(entry)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Editar</button><button disabled={busy} onClick={() => void remove(entry)} className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300 disabled:opacity-50">Eliminar</button></div></div>
      </article>)}</div>
    </section>
  </main>;
}
