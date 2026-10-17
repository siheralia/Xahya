"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Opt = { id: number; name: string };
type Cohort = { id: number; name: string; locationId: number; locationName: string; population: string; wealth: string };
type Group = { id: number; name: string; groupType: string; status: string; leaderName?: string | null; memberships: any[] };
type Polity = { id: number; name: string; polityType: string; status: string; founderName?: string | null; territories: any[]; groups: any[] };
const fmt = (v: unknown) => { try { return BigInt(String(v ?? 0)).toLocaleString("es-MX"); } catch { return String(v ?? "0"); } };
const input = "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400";
const label = "mb-1.5 block text-sm text-zinc-300";
const btn = "rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-50";
const groupTypes = [["CLAN","Clan"],["GUILD","Gremio"],["RELIGIOUS","Comunidad religiosa"],["CULTURAL","Comunidad cultural"],["POLITICAL_MOVEMENT","Movimiento político"],["MIGRANT_COMMUNITY","Comunidad migrante"],["MILITARY","Grupo militar"],["OTHER","Otra"]];
const polityTypes = [["KINGDOM","Reino"],["CITY_STATE","Ciudad-Estado"],["EMPIRE","Imperio"],["REPUBLIC","República"],["CONFEDERATION","Confederación"],["TRIBE","Tribu"],["PRINCIPALITY","Principado"],["OTHER","Otra]];
const field = (labelText: string, name: string, type = "text", required = true) => <label className="block"><span className={label}>{labelText}</span><input className={input} name={name} type={type} required={required} min={type === "number" ? 0 : undefined} /></label>;
const select = (labelText: string, name: string, items: Opt[], required = true) => <label className="block"><span className={label}>{labelText}</span><select className={input} name={name} required={required} defaultValue=""><option value="">Seleccionar…</option>{items.map((x) => <option key={x.id} value={x.id}>{x.name} · #{x.id}</option>)}</select></label>;

export default function WorldSocialStructurePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [polities, setPolities] = useState<Polity[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [characters, setCharacters] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/management/world/social-structure", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar la estructura social.");
      setGroups(data.groups ?? []); setPolities(data.polities ?? []); setCohorts(data.cohorts ?? []);
      setLocations(data.locations ?? []); setCharacters(data.characters ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(action: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    const form = event.currentTarget;
    const values: Record<string, FormDataEntryValue> = Object.fromEntries(new FormData(form).entries());
    for (const key of ["population", "wealth", "memberCount", "wealthShare", "loyalty"]) if (values[key] === "") delete values[key];
    try {
      const response = await fetch("/api/management/world/social-structure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar.");
      setSuccess(action === "split-cohort" ? "División realizada: la población y riqueza se trasladaron del origen al fragmento sin duplicarlas." : "Cambios guardados.");
      form.reset(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Link href="/management/world" className="text-sm text-zinc-500 hover:text-zinc-300">← Gestión del mundo</Link>
    <header className="mt-4 mb-7">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Estructura social y política</p>
      <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Agrupaciones, seguidores y reinos</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">Las cohortes describen población; las agrupaciones conectan personas de varias cohortes; las entidades políticas organizan territorios. La división de cohortes sí mueve población y riqueza entre ubicaciones. Las afiliaciones agregadas son estimaciones y pueden solaparse entre grupos, por lo que no se suman como población mundial adicional.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Link className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" href="/management/world/cohorts">Gestionar cohortes</Link><button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => void load()}>Actualizar datos</button></div>
    </header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
    {success && <div className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div>}
    {loading ? <p className="py-12 text-center text-zinc-400">Cargando estructura social…</p> : <>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><p className="text-sm text-zinc-500">Agrupaciones</p><p className="mt-1 text-2xl font-semibold text-white">{groups.length}</p></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><p className="text-sm text-zinc-500">Entidades políticas</p><p className="mt-1 text-2xl font-semibold text-white">{polities.length}</p></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><p className="text-sm text-zinc-500">Cohortes activas disponibles</p><p className="mt-1 text-2xl font-semibold text-white">{cohorts.length}</p></div>
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-xl font-semibold text-white">1. Crear agrupación social</h2><p className="my-2 text-sm text-zinc-500">Clan, gremio, comunidad religiosa, movimiento político, grupo migrante u otra organización no necesariamente territorial.</p>
        <form onSubmit={(e) => void submit("create-group", e)} className="grid gap-4 md:grid-cols-2">
          {field("Nombre", "name")}
          <label><span className={label}>Tipo</span><select name="groupType" className={input} defaultValue="CLAN">{groupTypes.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {select("Líder (opcional)", "leaderCharacterId", characters, false)}
          {field("Fecha de fundación (opcional)", "foundedAt", "date", false)}
          <label className="md:col-span-2"><span className={label}>Descripción</span><textarea name="description" className={input} rows={2} /></label>
          <div><button className={btn} disabled={saving}>Crear agrupación</button></div>
        </form>
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-xl font-semibold text-white">2. Afiliar parte de una cohorte</h2><p className="my-2 text-sm text-zinc-500">Esto registra una afiliación estimada, no traslada habitantes. Los mismos habitantes pueden tener identidades sociales múltiples.</p>
        <form onSubmit={(e) => void submit("add-membership", e)} className="grid gap-4 md:grid-cols-2">
          {select("Agrupación", "groupId", groups)}
          {select("Cohorte", "cohortId", cohorts.map(c => ({ id: c.id, name: c.name + " — " + c.locationName + " (" + fmt(c.population) + ")" })))}
          {field("Integrantes estimados", "memberCount", "number")}
          {field("Riqueza atribuida (opcional)", "wealthShare", "number", false)}
          {field("Rol", "role", "text", false)}
          {field("Notas", "notes", "text", false)}
          <div><button className={btn} disabled={saving}>Guardar afiliación</button></div>
        </form>
      </section>
      <section className="mt-6 rounded-2xl border border-cyan-900/50 bg-cyan-950/10 p-5">
        <h2 className="text-xl font-semibold text-white">3. Dividir una cohorte y trasladar seguidores</h2><p className="my-2 text-sm text-zinc-400">Esta acción descuenta población y riqueza del origen y crea un fragmento en el destino. El fragmento conserva raza, ocupación, clase, edad y parámetros demográficos. No permite trasladar a toda la cohorte para evitar dejar el registro fuente vacío.</p>
        <form onSubmit={(e) => void submit("split-cohort", e)} className="grid gap-4 md:grid-cols-2">
          {select("Cohorte de origen", "sourceCohortId", cohorts.map(c => ({ id: c.id, name: c.name + " — " + c.locationName + " (" + fmt(c.population) + " personas; riqueza " + fmt(c.wealth) + ")" })))}
          {select("Nueva ubicación", "locationId", locations)}
          {field("Nombre del fragmento", "name")}
          {field("Población a trasladar", "population", "number")}
          {field("Riqueza a trasladar (vacío = proporcional)", "wealth", "number", false)}
          {select("Afiliar a agrupación (opcional)", "groupId", groups, false)}
          {select("Vincular a reino (opcional)", "polityId", polities, false)}
          {field("Motivo de la división", "reason", "text", false)}
          <div className="md:col-span-2"><button className={btn} disabled={saving}>Trasladar y crear fragmento</button></div>
        </form>
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-xl font-semibold text-white">4. Fundar una entidad política</h2><p className="my-2 text-sm text-zinc-500">El territorio inicial es opcional; se puede fundar una entidad con seguidores antes de controlar una ciudad.</p>
        <form onSubmit={(e) => void submit("create-polity", e)} className="grid gap-4 md:grid-cols-2">
          {field("Nombre del reino o entidad", "name")}
          <label><span className={label}>Tipo</span><select name="polityType" className={input} defaultValue="KINGDOM">{polityTypes.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {select("Fundador (opcional)", "founderCharacterId", characters, false)}
          {select("Territorio inicial / capital (opcional)", "locationId", locations, false)}
          {select("Agrupación que lo apoya (opcional)", "groupId", groups, false)}
          <label className="md:col-span-2"><span className={label}>Descripción</span><textarea name="description" className={input} rows={2} /></label>
          <div><button className={btn} disabled={saving}>Fundar entidad política</button></div>
        </form>
      </section>
      <section className="mt-7 grid gap-6 lg:grid-cols-2">
        <div><h2 className="mb-3 text-xl font-semibold text-white">Agrupaciones existentes</h2>{groups.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">Todavía no hay agrupaciones.</p> : <div className="space-y-3">{groups.map(g => <article key={g.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{g.name}</h3><p className="mt-1 text-xs text-zinc-500">{groupTypes.find(([v]) => v === g.groupType)?.[1] ?? g.groupType} · {g.status} · {g.leaderName ? "Líder: " + g.leaderName : "Sin líder registrado"}</p></div><span className="text-xs text-zinc-500">#{g.id}</span></div><div className="mt-3 space-y-2">{g.memberships.map((m: any) => <p key={m.id} className="text-xs text-zinc-400">{m.cohortName} · {m.locationName}: {fmt(m.memberCount)} integrantes estimados · rol {m.role}</p>)}</div></article>)}</div>}</div>
        <div><h2 className="mb-3 text-xl font-semibold text-white">Reinos y entidades políticas</h2>{polities.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">Todavía no hay entidades políticas.</p> : <div className="space-y-3">{polities.map(p => <article key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{p.name}</h3><p className="mt-1 text-xs text-zinc-500">{polityTypes.find(([v]) => v === p.polityType)?.[1] ?? p.polityType} · {p.status} · {p.founderName ? "Fundador: " + p.founderName : "Sin fundador"}</p></div><span className="text-xs text-zinc-500">#{p.id}</span></div><div className="mt-3 space-y-1">{p.territories.map((t: any) => <p key={t.id} className="text-xs text-zinc-400">{t.isCapital ? "Capital" : t.relationType}: {t.locationName}</p>)}{p.groups.map((g: any) => <p key={g.id} className="text-xs text-cyan-300">Agrupación {g.groupName} · {g.relationType}</p>)}</div></article>)}</div>}</div>
      </section>
    </>}
  </main>;
}
