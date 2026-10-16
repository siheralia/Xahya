"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  parentName: string | null;
  description: string | null;
  publicationStatus: string;
  operationalStatus: string;
  claimability: string;
  childrenCount: number;
};

const TYPES = [
  ["CONTINENT", "Continente"], ["REGION", "Región"], ["CITY", "Ciudad"],
  ["ISLAND", "Isla"], ["ARCHIPELAGO", "Archipiélago"], ["FLOATING_ISLAND", "Isla flotante"],
  ["NEIGHBORHOOD", "Barrio"], ["BUILDING", "Edificio"], ["POINT_OF_INTEREST", "Punto de interés"],
];
const PUBLICATION = [["DRAFT", "Borrador"], ["PUBLISHED", "Publicado"], ["ARCHIVED", "Archivado"]];
const OPERATIONAL = [["ACTIVE", "Activo"], ["INACTIVE", "Inactivo"]];
const CLAIMABILITY = [["NOT_CLAIMABLE", "No reclamable"], ["CLAIMABLE", "Reclamable"]];

const typeLabel = (value: string) => TYPES.find(([key]) => key === value)?.[1] ?? value;
const statusLabel = (value: string) => PUBLICATION.find(([key]) => key === value)?.[1] ?? value;

const blankForm = {
  id: null as number | null,
  name: "",
  type: "CITY",
  parentId: "",
  description: "",
  publicationStatus: "DRAFT",
  operationalStatus: "ACTIVE",
  claimability: "NOT_CLAIMABLE",
};

export default function WorldManagementPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState(blankForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/management/world", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las locaciones.");
      setLocations(data.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las locaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleLocations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return locations.filter((location) => {
      const matchesSearch = !term || [location.name, location.description ?? "", location.parentName ?? "", typeLabel(location.type)]
        .some((value) => value.toLocaleLowerCase("es").includes(term));
      return matchesSearch && (statusFilter === "ALL" || location.publicationStatus === statusFilter);
    });
  }, [locations, search, statusFilter]);

  const treeLocations = useMemo(() => {
    const included = new Set<number>();
    const byId = new Map(locations.map((location) => [location.id, location]));
    for (const location of visibleLocations) {
      let current: Location | undefined = location;
      const visited = new Set<number>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        included.add(current.id);
        current = current.parentId == null ? undefined : byId.get(current.parentId);
      }
    }
    return locations.filter((location) => included.has(location.id));
  }, [locations, visibleLocations]);

  const treeById = useMemo(() => new Map(treeLocations.map((location) => [location.id, location])), [treeLocations]);
  const treeRoots = useMemo(
    () => treeLocations.filter((location) => location.parentId == null || !treeById.has(location.parentId)),
    [treeLocations, treeById],
  );

  function toggleExpanded(id: number) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTreeNode(location: Location, depth = 0): ReactNode {
    const children = treeLocations.filter((candidate) => candidate.parentId === location.id)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(location.id) || Boolean(search.trim()) || statusFilter !== "ALL";
    return (
      <div key={location.id} className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 hover:border-zinc-700"
          style={{ marginLeft: Math.min(depth, 8) * 12 }}>
          {hasChildren ? (
            <button type="button" aria-label={expanded ? "Contraer sublocaciones" : "Expandir sublocaciones"}
              aria-expanded={expanded} onClick={() => toggleExpanded(location.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
            </button>
          ) : <span className="w-8 shrink-0 text-center text-zinc-700">•</span>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{location.name}</span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{typeLabel(location.type)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${location.publicationStatus === "PUBLISHED" ? "border-emerald-800 text-emerald-300" : location.publicationStatus === "ARCHIVED" ? "border-zinc-700 text-zinc-500" : "border-amber-800 text-amber-300"}`}>{statusLabel(location.publicationStatus)}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">ID {location.id} · {children.length} sublocaciones{location.parentId == null ? " · Sin padre" : ""}</p>
            {location.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{location.description}</p>}
          </div>
          <button type="button" onClick={() => editLocation(location)} className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Editar</button>
        </div>
        {hasChildren && expanded && <div className="mt-2 space-y-2 border-l border-zinc-700/80 pl-2 sm:pl-4">
          {children.map((child) => renderTreeNode(child, depth + 1))}
        </div>}
      </div>
    );
  }

  function editLocation(location: Location) {
    setForm({
      id: location.id,
      name: location.name,
      type: location.type,
      parentId: location.parentId == null ? "" : String(location.parentId),
      description: location.description ?? "",
      publicationStatus: location.publicationStatus,
      operationalStatus: location.operationalStatus,
      claimability: location.claimability,
    });
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(blankForm);
    setError("");
    setSuccess("");
  }

  async function saveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.id === null ? "create" : "update",
          id: form.id,
          name: form.name,
          type: form.type,
          parentId: form.parentId || null,
          description: form.description,
          publicationStatus: form.publicationStatus,
          operationalStatus: form.operationalStatus,
          claimability: form.claimability,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la locación.");
      setSuccess(form.id === null ? "Locación creada." : "Locación actualizada.");
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la locación.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <nav className="mb-6 flex flex-wrap gap-2"><Link href="/management/world/cohorts" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-cyan-700">Cohortes de población ↗</Link><Link href="/management/world/catalogs" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-cyan-700">Ocupaciones y clases sociales ↗</Link><Link href="/management/races" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-cyan-700">Razas ↗</Link></nav>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/management" className="text-sm text-zinc-500 hover:text-zinc-300">← Gestión</Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Geografía del mundo</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Gestión del mundo</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Prepara continentes, regiones, ciudades e islas. Publicación, actividad y reclamabilidad son estados independientes.
            No necesitas tener un mapa ni rutas para crear una locación.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/management/world/cohorts" className="inline-flex rounded-lg border border-cyan-500/40 bg-cyan-950/20 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-950/40">Gestionar cohortes de población →</Link>
            <Link href="/management/world/infrastructure" className="inline-flex rounded-lg border border-violet-500/40 bg-violet-950/20 px-4 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-950/40">Infraestructura →</Link>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
          <span className="block text-2xl font-semibold text-white">{locations.length}</span>
          locaciones registradas
        </div>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
      {success && <div role="status" className="mb-5 rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-4 text-sm text-emerald-300">{success}</div>}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">{form.id === null ? "Crear locación" : "Editar locación"}</h2>
            <p className="mt-1 text-sm text-zinc-500">Los nombres pueden repetirse en distintas regiones; el ID permanece estable al editar.</p>
          </div>
          {form.id !== null && <button type="button" onClick={resetForm} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancelar edición</button>}
        </div>

        <form onSubmit={saveLocation} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-zinc-300">Nombre *</span>
            <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej. Islas del Alba" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-cyan-400" />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">Tipo *</span>
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white">
              {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">Forma parte de</span>
            <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white">
              <option value="">Sin locación superior</option>
              {locations.filter((location) => location.id !== form.id).map((location) => (
                <option key={location.id} value={location.id}>{location.name} · {typeLabel(location.type)}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-600">La jerarquía organiza lugares; no crea rutas ni garantiza acceso.</span>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">Publicación</span>
            <select value={form.publicationStatus} onChange={(event) => setForm({ ...form, publicationStatus: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white">
              {PUBLICATION.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">Estado operativo</span>
            <select value={form.operationalStatus} onChange={(event) => setForm({ ...form, operationalStatus: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white">
              {OPERATIONAL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">¿Se puede reclamar?</span>
            <select value={form.claimability} onChange={(event) => setForm({ ...form, claimability: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white">
              {CLAIMABILITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm text-zinc-300">Descripción (opcional)</span>
            <textarea rows={3} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Información conocida hasta ahora…" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-cyan-400" />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:opacity-50">
              {saving ? "Guardando…" : form.id === null ? "Crear locación" : "Guardar cambios"}
            </button>
            {form.id === null && <button type="button" onClick={resetForm} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800">Limpiar</button>}
          </div>
        </form>
      </section>

      <section className="mt-7">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
              <button type="button" onClick={() => setViewMode("tree")} aria-pressed={viewMode === "tree"}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${viewMode === "tree" ? "bg-cyan-300 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}>Vista de árbol</button>
              <button type="button" onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${viewMode === "list" ? "bg-cyan-300 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}>Vista de lista</button>
            </div>
            {viewMode === "tree" && treeLocations.length > 0 && <div className="flex gap-2">
              <button type="button" onClick={() => setExpandedIds(new Set(treeLocations.filter((location) => treeLocations.some((child) => child.parentId === location.id)).map((location) => location.id)))}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Expandir todo</button>
              <button type="button" onClick={() => setExpandedIds(new Set())}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Contraer todo</button>
            </div>}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, descripción, tipo o superior…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-white">
              <option value="ALL">Todos los estados</option>
              {PUBLICATION.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {viewMode === "tree" && <p className="text-xs text-zinc-500">Las locaciones sin padre aparecen en la raíz. La búsqueda conserva los antecesores para mantener el contexto.</p>}
        </div>

        {loading ? <p className="py-12 text-center text-sm text-zinc-500">Cargando locaciones…</p> :
          visibleLocations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center">
              <p className="font-medium text-zinc-300">{locations.length === 0 ? "Todavía no hay locaciones" : "No hay resultados"}</p>
              <p className="mt-2 text-sm text-zinc-500">{locations.length === 0 ? "Crea la primera ciudad, región, isla o continente desde el formulario." : "Prueba con otro término o estado."}</p>
            </div>
          ) : viewMode === "tree" ? (
            <div className="space-y-3">{treeRoots.map((location) => renderTreeNode(location))}</div>
          ) : (
            <div className="grid gap-3">
              {visibleLocations.map((location) => (
                <article key={location.id} className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{location.name}</h3>
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{typeLabel(location.type)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${location.publicationStatus === "PUBLISHED" ? "border-emerald-800 text-emerald-300" : location.publicationStatus === "ARCHIVED" ? "border-zinc-700 text-zinc-500" : "border-amber-800 text-amber-300"}`}>{statusLabel(location.publicationStatus)}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">ID {location.id}{location.parentName ? ` · Dentro de ${location.parentName}` : " · Sin locación superior"} · {location.childrenCount} sublocaciones</p>
                    {location.description && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{location.description}</p>}
                    <p className="mt-2 text-xs text-zinc-600">{location.operationalStatus === "ACTIVE" ? "Operativa" : "Inactiva"} · {location.claimability === "CLAIMABLE" ? "Reclamable" : "No reclamable"}</p>
                  </div>
                  <button type="button" onClick={() => editLocation(location)} className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Editar</button>
                </article>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}
