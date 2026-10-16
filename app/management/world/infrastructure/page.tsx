"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string; type: string; parentId: number | null };
type Node = {
  id: number; code: string; name: string; kind: string; worldLocationId: number | null;
  locationName: string | null; description: string | null; foundingHistory: string | null;
  constructionType: string | null; coverage: Record<string, unknown>; details: Record<string, unknown>;
  operationalStatus: string; publicationStatus: string;
};
type LinkRecord = {
  id: number; sourceId: number; targetId: number; sourceName: string; targetName: string;
  linkType: string; operationalStatus: string; description: string | null;
};
type Form = {
  id: number | null; code: string; name: string; kind: string; worldLocationId: string;
  description: string; foundingHistory: string; constructionType: string;
  coverage: string; details: string; operationalStatus: string; publicationStatus: string;
};
const EMPTY: Form = {
  id: null, code: "", name: "", kind: "TOWER", worldLocationId: "",
  description: "", foundingHistory: "", constructionType: "", coverage: "{}", details: "{}",
  operationalStatus: "PLANNED", publicationStatus: "DRAFT",
};
const KINDS = [
  ["TOWER", "Torre terrestre"], ["ORBITAL_SATELLITE", "Ojo de Nova (satélite)"],
  ["GLOBAL_HEADQUARTERS", "Sede global"],
];
const STATUSES = [
  ["PLANNED", "Planeado"], ["ACTIVE", "Activo"], ["INACTIVE", "Inactivo"],
  ["MAINTENANCE", "Mantenimiento"], ["DAMAGED", "Dañado"],
];
const PUBLICATION = [["DRAFT", "Borrador"], ["PUBLISHED", "Publicado"], ["ARCHIVED", "Archivado"]];
const LINK_TYPES = [
  ["TRANSMISSION", "Transmisión"], ["BACKHAUL", "Enlace troncal"], ["SATELLITE_UPLINK", "Subida al satélite"],
  ["SATELLITE_DOWNLINK", "Bajada del satélite"], ["HEADQUARTERS_CONTROL", "Control desde sede"],
];
const label = (items: string[][], value: string) => items.find(([key]) => key === value)?.[1] ?? value;
const inputClass = "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-cyan-400";
const buttonClass = "rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

export default function WorldInfrastructurePage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [linkForm, setLinkForm] = useState({ sourceId: "", targetId: "", linkType: "TRANSMISSION", operationalStatus: "PLANNED", description: "" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/management/world/infrastructure", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar Red Nova Link.");
      setNodes(data.nodes ?? []); setLinks(data.links ?? []); setLocations(data.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Red Nova Link.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filteredNodes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return nodes.filter((node) => !term || [node.code, node.name, node.locationName ?? "", node.kind, node.description ?? ""]
      .some((value) => value.toLocaleLowerCase("es").includes(term)));
  }, [nodes, search]);

  function edit(node: Node) {
    setForm({
      id: node.id, code: node.code, name: node.name, kind: node.kind,
      worldLocationId: node.worldLocationId == null ? "" : String(node.worldLocationId),
      description: node.description ?? "", foundingHistory: node.foundingHistory ?? "",
      constructionType: node.constructionType ?? "", coverage: JSON.stringify(node.coverage ?? {}, null, 2),
      details: JSON.stringify(node.details ?? {}, null, 2), operationalStatus: node.operationalStatus,
      publicationStatus: node.publicationStatus,
    });
    setError(""); setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() { setForm(EMPTY); setError(""); setSuccess(""); }

  async function saveNode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      let coverage: unknown; let details: unknown;
      try { coverage = JSON.parse(form.coverage); } catch { throw new Error("Cobertura debe ser JSON válido."); }
      try { details = JSON.parse(form.details); } catch { throw new Error("Detalles debe ser JSON válido."); }
      const response = await fetch("/api/management/world/infrastructure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.id === null ? "create-node" : "update-node", id: form.id, code: form.code, name: form.name,
          kind: form.kind, worldLocationId: form.worldLocationId || null, description: form.description,
          foundingHistory: form.foundingHistory, constructionType: form.constructionType, coverage, details,
          operationalStatus: form.operationalStatus, publicationStatus: form.publicationStatus,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar el nodo.");
      setSuccess(form.id === null ? "Nodo creado." : "Nodo actualizado.");
      setForm(EMPTY); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el nodo."); }
    finally { setSaving(false); }
  }

  async function removeNode(node: Node) {
    if (!window.confirm(`¿Eliminar ${node.name} y sus conexiones?`)) return;
    setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/infrastructure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-node", id: node.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar el nodo.");
      if (form.id === node.id) setForm(EMPTY);
      setSuccess("Nodo y conexiones eliminados."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar el nodo."); }
  }

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/infrastructure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-link", ...linkForm }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo crear la conexión.");
      setLinkForm({ sourceId: "", targetId: "", linkType: "TRANSMISSION", operationalStatus: "PLANNED", description: "" });
      setSuccess("Conexión creada."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la conexión."); }
    finally { setSaving(false); }
  }

  async function removeLink(link: LinkRecord) {
    if (!window.confirm(`¿Eliminar conexión ${link.sourceName} → ${link.targetName}?`)) return;
    setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/world/infrastructure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-link", id: link.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar la conexión.");
      setSuccess("Conexión eliminada."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar la conexión."); }
  }

  const count = (kind: string) => nodes.filter((node) => node.kind === kind).length;

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-7">
      <Link href="/management/world" className="text-sm text-zinc-500 hover:text-zinc-300">← Gestión del mundo</Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Red Nova Link</p>
      <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Infraestructura de comunicación</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Administra los 26 nodos terrestres, los 4 Ojos de Nova y la sede global adicional. Esta red transmite información arcana; no crea portales ni sustituye a Dvāra/Setu. Los registros nuevos comienzan como borrador y planeados.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Nodos totales", String(nodes.length)], ["Torres", String(count("TOWER"))], ["Ojos de Nova", String(count("ORBITAL_SATELLITE"))], ["Sede global", String(count("GLOBAL_HEADQUARTERS"))]].map(([title, value]) =>
          <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-xs text-zinc-500">{title}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>)}
      </div>
    </div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
    {success && <div role="status" className="mb-5 rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-4 text-sm text-emerald-300">{success}</div>}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">{form.id === null ? "Registrar nodo" : "Editar nodo"}</h2><p className="mt-1 text-sm text-zinc-500">Usa códigos estables como RNL-T01, RNL-OJO-01 o RNL-SEDE-GLOBAL.</p></div>{form.id !== null && <button type="button" onClick={reset} className={buttonClass}>Cancelar edición</button>}</div>
      <form onSubmit={saveNode} className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm text-zinc-300">Código único *</span><input required maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="RNL-T01" className={inputClass} /></label>
        <label className="block"><span className="text-sm text-zinc-300">Nombre *</span><input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Torre de Agnikota" className={inputClass} /></label>
        <label className="block"><span className="text-sm text-zinc-300">Tipo de nodo</span><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputClass}>{KINDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Ubicación geográfica (opcional)</span><select value={form.worldLocationId} onChange={(e) => setForm({ ...form, worldLocationId: e.target.value })} className={inputClass}><option value="">Sin ubicación asignada</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.type}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Estado operativo</span><select value={form.operationalStatus} onChange={(e) => setForm({ ...form, operationalStatus: e.target.value })} className={inputClass}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Publicación</span><select value={form.publicationStatus} onChange={(e) => setForm({ ...form, publicationStatus: e.target.value })} className={inputClass}>{PUBLICATION.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Construcción / soporte</span><input maxLength={120} value={form.constructionType} onChange={(e) => setForm({ ...form, constructionType: e.target.value })} placeholder="Piedra conductora, cristal, metal…" className={inputClass} /></label>
        <label className="block"><span className="text-sm text-zinc-300">Descripción</span><textarea rows={2} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></label>
        <label className="block sm:col-span-2"><span className="text-sm text-zinc-300">Historia de fundación</span><textarea rows={3} maxLength={6000} value={form.foundingHistory} onChange={(e) => setForm({ ...form, foundingHistory: e.target.value })} placeholder="Quién la levantó, qué conflicto o descubrimiento la originó…" className={inputClass} /></label>
        <label className="block"><span className="text-sm text-zinc-300">Cobertura (JSON)</span><textarea rows={4} value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} className={inputClass} /><span className="mt-1 block text-xs text-zinc-600">Ej.: { "{\"radiusKm\": 300, \"regions\": []}" }</span></label>
        <label className="block"><span className="text-sm text-zinc-300">Detalles técnicos / orbitales (JSON)</span><textarea rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} className={inputClass} /><span className="mt-1 block text-xs text-zinc-600">Para satélites: órbita, inclinación y altitud.</span></label>
        <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-50">{saving ? "Guardando…" : form.id === null ? "Registrar nodo" : "Guardar cambios"}</button>{form.id === null && <button type="button" onClick={reset} className="ml-2 rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300">Limpiar</button>}</div>
      </form>
    </section>

    <section className="mt-7">
      <div className="mb-4"><h2 className="text-xl font-semibold text-white">Nodos registrados</h2><p className="mt-1 text-sm text-zinc-500">La ubicación es la geografía ya existente de Xahya; no se generan ciudades duplicadas.</p></div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, nodo, ciudad o tipo…" className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400" />
      {loading ? <p className="py-10 text-center text-sm text-zinc-500">Cargando infraestructura…</p> : filteredNodes.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Todavía no hay nodos. El modelo está preparado, pero no inventamos instalaciones ni coordenadas sin registrarlas.</div> :
        <div className="grid gap-3">{filteredNodes.map((node) => <article key={node.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-zinc-800 px-2 py-1 font-mono text-xs text-cyan-300">{node.code}</span><h3 className="font-semibold text-white">{node.name}</h3></div><p className="mt-2 text-sm text-zinc-400">{label(KINDS, node.kind)}{node.locationName ? ` · ${node.locationName}` : " · Sin ubicación asignada"}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">{label(STATUSES, node.operationalStatus)}</span><span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">{label(PUBLICATION, node.publicationStatus)}</span></div>{node.description && <p className="mt-3 max-w-3xl text-sm text-zinc-400">{node.description}</p>}</div><div className="flex gap-2"><button type="button" onClick={() => edit(node)} className={buttonClass}>Editar</button><button type="button" onClick={() => void removeNode(node)} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30">Eliminar</button></div></div>
        </article>)}</div>}
    </section>

    <section className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-white">Conexiones de transmisión</h2>
      <p className="mt-1 text-sm text-zinc-500">Los enlaces son dirigidos. Crear una conexión no activa automáticamente la red.</p>
      <form onSubmit={createLink} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm text-zinc-300">Nodo de origen *</span><select required value={linkForm.sourceId} onChange={(e) => setLinkForm({ ...linkForm, sourceId: e.target.value })} className={inputClass}><option value="">Selecciona origen</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Nodo de destino *</span><select required value={linkForm.targetId} onChange={(e) => setLinkForm({ ...linkForm, targetId: e.target.value })} className={inputClass}><option value="">Selecciona destino</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Tipo de conexión</span><select value={linkForm.linkType} onChange={(e) => setLinkForm({ ...linkForm, linkType: e.target.value })} className={inputClass}>{LINK_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block"><span className="text-sm text-zinc-300">Estado</span><select value={linkForm.operationalStatus} onChange={(e) => setLinkForm({ ...linkForm, operationalStatus: e.target.value })} className={inputClass}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block sm:col-span-2"><span className="text-sm text-zinc-300">Descripción (opcional)</span><input maxLength={2000} value={linkForm.description} onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })} placeholder="Ruta de relevo, enlace de respaldo…" className={inputClass} /></label>
        <div className="sm:col-span-2"><button type="submit" disabled={saving || nodes.length < 2} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-50">{saving ? "Guardando…" : "Crear conexión"}</button></div>
      </form>
      {links.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Todavía no hay conexiones registradas.</p> : <div className="mt-6 grid gap-3">{links.map((link) => <article key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><div className="min-w-0"><p className="font-medium text-white">{link.sourceName} <span className="text-cyan-300">→</span> {link.targetName}</p><p className="mt-1 text-sm text-zinc-400">{label(LINK_TYPES, link.linkType)} · {label(STATUSES, link.operationalStatus)}</p>{link.description && <p className="mt-1 text-sm text-zinc-500">{link.description}</p>}</div><button type="button" onClick={() => void removeLink(link)} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30">Eliminar</button></article>)}</div>}
    </section>
    <div className="mt-6 flex flex-wrap gap-3"><Link href="/management/world" className={buttonClass}>Volver a geografía</Link><Link href="/management/world/cohorts" className={buttonClass}>Gestionar cohortes →</Link></div>
  </main>;
}
