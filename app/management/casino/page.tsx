"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Schedule = { id: string; setId: string; dayOfWeek: number; startTime: string; endTime: string; active: boolean };

type Segment = {
  label: string;
  weight: number;
  multiplier: number;
  color: string;
};

type CasinoSet = {
  id: string;
  name: string;
  description: string;
  houseEdgeLabel: string;
  expectedReturn: number;
  segments: Segment[];
  builtIn?: boolean;
};

const emptySegment = (): Segment => ({
  label: "0",
  weight: 10,
  multiplier: -1,
  color: "#18181b",
});

function formatPercent(value: number) {
  return (value * 100).toFixed(2) + "%";
}

function getWheelBackground(segments: Segment[]) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.weight), 0);
  if (!total) return "#18181b";
  let start = 0;
  const stops = segments.map((segment) => {
    const end = start + (Math.max(0, segment.weight) / total) * 360;
    const stop = segment.color + " " + start + "deg " + end + "deg";
    start = end;
    return stop;
  });
  return "conic-gradient(from 0deg, " + stops.join(", ") + ")";
}

export default function CasinoManagementPage() {
  const [sets, setSets] = useState<CasinoSet[]>([]);
  const [activeSetId, setActiveSetId] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleSetId, setScheduleSetId] = useState("");
  const [scheduleDay, setScheduleDay] = useState(-1);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("12:00");
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<CasinoSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/management/casino", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar la gestión del casino.");
      setSets(data.sets ?? []);
      setActiveSetId(data.activeSetId ?? "");
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
      setActiveScheduleId(data.activeScheduleId ?? null);
      setScheduleSetId((current) => current || data.sets?.[0]?.id || "");
      setSelectedId(data.activeSetId ?? data.sets?.[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la gestión del casino.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => sets.find((set) => set.id === selectedId) ?? null,
    [sets, selectedId],
  );

  function startCreate() {
    setEditing({
      id: "custom-" + Date.now(),
      name: "Nuevo set",
      description: "",
      houseEdgeLabel: "",
      expectedReturn: 0,
      segments: [emptySegment(), { label: "+10%", weight: 10, multiplier: 0.1, color: "#be123c" }],
      builtIn: false,
    });
    setError("");
    setSuccess("");
  }

  function startEdit(set: CasinoSet) {
    setEditing(JSON.parse(JSON.stringify(set)));
    setError("");
    setSuccess("");
  }

  function updateEditing(field: "name" | "description" | "houseEdgeLabel", value: string) {
    setEditing((current) => current ? { ...current, [field]: value } : current);
  }

  function updateSegment(index: number, field: keyof Segment, value: string) {
    setEditing((current) => {
      if (!current) return current;
      const segments = current.segments.map((segment, i) => {
        if (i !== index) return segment;
        if (field === "label" || field === "color") return { ...segment, [field]: value };
        return { ...segment, [field]: Number(value) };
      });
      return { ...current, segments };
    });
  }

  function addSegment() {
    setEditing((current) => current ? { ...current, segments: [...current.segments, emptySegment()] } : current);
  }

  function removeSegment(index: number) {
    setEditing((current) => {
      if (!current || current.segments.length <= 1) return current;
      return { ...current, segments: current.segments.filter((_, i) => i !== index) };
    });
  }

  async function saveSet() {
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", set: editing }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar el set.");
      setEditing(null);
      setSuccess(`Set "${data.set.name}" guardado.`);
      await load();
      setSelectedId(data.set.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el set.");
    } finally {
      setSaving(false);
    }
  }

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function addSchedule() {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "schedule-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    setSchedules((current) => [...current, {
      id,
      setId: scheduleSetId || sets[0]?.id || "",
      dayOfWeek: scheduleDay,
      startTime: scheduleStart,
      endTime: scheduleEnd,
      active: true,
    }]);
    setError("");
    setSuccess("");
  }

  async function saveSchedules() {
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scheduleSave", schedules }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la programación.");
      setSchedules(data.schedules ?? []);
      setActiveSetId(data.activeSetId ?? activeSetId);
      setActiveScheduleId(data.activeScheduleId ?? null);
      setSuccess("Programación guardada. Los cambios se aplican automáticamente según la hora de Chihuahua.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la programación.");
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    if (!selected || saving || selected.id === activeSetId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", setId: selected.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cambiar el set.");
      setActiveSetId(data.activeSetId);
      setSuccess(`Set "${selected.name}" activado. Las siguientes tiradas usarán esta configuración.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el set.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet() {
    if (!selected || selected.builtIn || saving) return;
    if (!window.confirm(`¿Eliminar el set "${selected.name}"?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/management/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", setId: selected.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar el set.");
      setSuccess("Set eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el set.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando gestión del casino...</p></main>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">← Gestión</Link>
            <h1 className="mt-4 text-4xl font-bold">Gestión del casino</h1>
            <p className="mt-2 text-zinc-500">Crea y edita sets de probabilidades sin tocar el código de la ruleta.</p>
          </div>
          <button type="button" onClick={startCreate} className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-zinc-950 hover:bg-emerald-400">
            + Crear set
          </button>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 rounded-2xl border border-sky-900/60 bg-zinc-900/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Programación de ruletas</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Elige sets ya creados y asigna un día o toda la semana y un horario. El casino permanece abierto; fuera de estos horarios se conserva el set activado manualmente. Los horarios activos no pueden solaparse.
              </p>
              <p className="mt-2 text-xs text-zinc-500">Zona horaria: America/Chihuahua · Días de domingo a sábado</p>
            </div>
            <button type="button" onClick={saveSchedules} disabled={saving} className="rounded-xl bg-sky-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar programación"}
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-zinc-300">
              Set de ruleta
              <select value={scheduleSetId} onChange={(e) => setScheduleSetId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3">
                {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Día
              <select value={scheduleDay} onChange={(e) => setScheduleDay(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3">
                <option value={-1}>Toda la semana</option>{dayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Desde
              <input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3" />
            </label>
            <label className="text-sm text-zinc-300">
              Hasta
              <input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3" />
            </label>
          </div>
          <button type="button" onClick={addSchedule} disabled={!sets.length || !scheduleSetId} className="mt-4 rounded-lg border border-sky-800 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-950/50 disabled:opacity-40">
            + Añadir horario
          </button>

          <div className="mt-5 space-y-3">
            {schedules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">Todavía no hay horarios programados.</p>
            ) : schedules.map((schedule) => {
              const set = sets.find((item) => item.id === schedule.setId);
              return (
                <div key={schedule.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">{set?.name ?? "Set no disponible"} · {schedule.dayOfWeek === -1 ? "Toda la semana" : dayNames[schedule.dayOfWeek]}</p>
                    <p className="mt-1 text-sm text-zinc-500">{schedule.startTime}–{schedule.endTime} · {schedule.active ? "Programación activa" : "Desactivada"}</p>
                    {schedule.id === activeScheduleId && <p className="mt-1 text-xs font-semibold text-emerald-300">Vigente ahora</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={schedule.active} onChange={(e) => setSchedules((current) => current.map((entry) => entry.id === schedule.id ? { ...entry, active: e.target.checked } : entry))} />
                    Activo
                  </label>
                  <button type="button" onClick={() => setSchedules((current) => current.filter((entry) => entry.id !== schedule.id))} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40">Quitar</button>
                </div>
              );
            })}
          </div>
        </section>

        {editing && (
          <section className="mt-8 rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{editing.builtIn ? "Editar set" : "Crear set"}</h2>
                <p className="text-sm text-zinc-500">Los cambios se guardan como configuración del casino.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm">Cancelar</button>
                <button type="button" onClick={saveSet} disabled={saving} className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-zinc-950 disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar set"}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="md:col-span-2"><span className="mb-1 block text-xs uppercase text-zinc-500">Nombre</span><input value={editing.name} onChange={(e) => updateEditing("name", e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
              <label><span className="mb-1 block text-xs uppercase text-zinc-500">Margen mostrado</span><input value={editing.houseEdgeLabel} onChange={(e) => updateEditing("houseEdgeLabel", e.target.value)} placeholder="Ej. ≈ -4.0% base" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
              <label className="md:col-span-3"><span className="mb-1 block text-xs uppercase text-zinc-500">Descripción</span><input value={editing.description} onChange={(e) => updateEditing("description", e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-600"><tr><th className="px-2 py-3">Resultado</th><th className="px-2 py-3">Peso</th><th className="px-2 py-3">Multiplicador</th><th className="px-2 py-3">Color</th><th /></tr></thead>
                <tbody>
                  {editing.segments.map((segment, index) => (
                    <tr key={index} className="border-b border-zinc-900">
                      <td className="px-2 py-2"><input value={segment.label} onChange={(e) => updateSegment(index, "label", e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2" /></td>
                      <td className="px-2 py-2"><input type="number" min="0.0001" step="0.01" value={segment.weight} onChange={(e) => updateSegment(index, "weight", e.target.value)} className="w-28 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={segment.multiplier} onChange={(e) => updateSegment(index, "multiplier", e.target.value)} className="w-28 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2" /></td>
                      <td className="px-2 py-2"><div className="flex items-center gap-2"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(segment.color) ? segment.color : "#18181b"} onChange={(e) => updateSegment(index, "color", e.target.value)} /><input value={segment.color} onChange={(e) => updateSegment(index, "color", e.target.value)} className="w-28 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs" /></div></td>
                      <td className="px-2 py-2"><button type="button" onClick={() => removeSegment(index)} className="rounded-lg px-3 py-2 text-red-400 hover:bg-red-950/40">Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addSegment} className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500">+ Añadir segmento</button>
          </section>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {sets.map((set) => (
            <button key={set.id} type="button" onClick={() => setSelectedId(set.id)} className={"rounded-2xl border p-5 text-left transition " + (selectedId === set.id ? "border-amber-400/60 bg-amber-950/15" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600")}>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-xl font-bold">{set.name}</h2><p className="mt-1 text-sm text-zinc-500">{set.description}</p></div>
                <div className="flex gap-2">{set.builtIn && <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">PREDETERMINADO</span>}{set.id === activeSetId && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">ACTIVO</span>}</div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 rounded-full border-4 border-zinc-800" style={{ background: getWheelBackground(set.segments) }} />
                <div><p className="text-sm text-zinc-400">Margen base</p><p className="text-2xl font-black text-amber-300">{formatPercent(set.expectedReturn)}</p><p className="mt-1 text-xs text-zinc-600">{set.houseEdgeLabel}</p></div>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-2xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-zinc-500">{selected.description}</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => startEdit(selected)} className="rounded-xl border border-zinc-700 px-4 py-3 font-semibold hover:border-zinc-500">Editar</button>
                {!selected.builtIn && <button type="button" onClick={deleteSet} disabled={saving} className="rounded-xl border border-red-900/70 px-4 py-3 font-semibold text-red-300 hover:bg-red-950/30">Eliminar</button>}
                <button type="button" onClick={activate} disabled={saving || selected.id === activeSetId} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {selected.id === activeSetId ? "Set activo" : saving ? "Activando..." : "Activar este set"}
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-600"><tr><th className="px-3 py-3">Segmento</th><th className="px-3 py-3">Peso</th><th className="px-3 py-3">Multiplicador</th><th className="px-3 py-3">Color</th></tr></thead>
                <tbody>{selected.segments.map((segment, index) => <tr key={index} className="border-b border-zinc-900"><td className="px-3 py-3 font-bold"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: segment.color }} />{segment.label}</td><td className="px-3 py-3 text-zinc-300">{segment.weight}</td><td className={"px-3 py-3 font-semibold " + (segment.multiplier < 0 ? "text-red-300" : "text-emerald-300")}>{segment.multiplier > 0 ? "+" : ""}{segment.multiplier}×</td><td className="px-3 py-3 font-mono text-xs text-zinc-500">{segment.color}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
