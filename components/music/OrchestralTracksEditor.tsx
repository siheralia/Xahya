"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ORCHESTRAL_INSTRUMENTS } from "@/lib/orbital-score.mjs";
import type { OrchestralTrack } from "@/lib/orbital-score.mjs";
import { pitchFromMidi } from "@/lib/orbital-orchestra.mjs";
import { moveInstrumentOrbit } from "@/lib/orbital-instrument-rings.mjs";
import type { InstrumentOrbit } from "@/lib/orbital-score.mjs";

const NAMES: Record<OrchestralTrack["instrument"], string> = {
  violin: "Violín", string_ensemble_1: "Conjunto de cuerdas",
  french_horn: "Trompa", cello: "Violonchelo",
  acoustic_bass: "Contrabajo", distortion_guitar: "Guitarra eléctrica",
  choir_aahs: "Coro", tremolo_strings: "Cuerdas trémolo",
  timpani: "Timbales", brass_section: "Metales", drumkit: "Batería",
};

export default function OrchestralTracksEditor({
  tracks, setTracks, period, selectedTrack, onSelectTrack,
}: {
  tracks: OrchestralTrack[];
  setTracks: Dispatch<SetStateAction<OrchestralTrack[]>>;
  period: number;
  selectedTrack: number;
  onSelectTrack: (index: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [orbitError, setOrbitError] = useState("");
  const selected = Math.min(selectedTrack, Math.max(0, tracks.length - 1));
  const track = tracks[selected];
  const size = 10;
  const pages = Math.max(1, Math.ceil((track?.notes.length ?? 0) / size));
  const safePage = Math.min(page, pages - 1);

  const updateTrack = (fn: (track: OrchestralTrack) => OrchestralTrack) => {
    setTracks((items) => items.map((item, i) => i === selected ? fn(item) : item));
  };
  const updateOrbit = (motion: InstrumentOrbit) => {
    if (!track) return;
    const updated = moveInstrumentOrbit(track, motion, period);
    if (!updated) {
      setOrbitError("Esa velocidad o posición sacaría notas fuera de la pieza. Prueba un giro más rápido.");
      return;
    }
    setOrbitError("");
    updateTrack(() => updated);
  };

  const updateNote = (index: number, field: "pitch" | "start" | "duration" | "velocity", value: number) => {
    updateTrack((item) => ({
      ...item, notes: item.notes.map((note, i) => i === index ? { ...note, [field]: value } : note),
    }));
  };

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-950/15 p-3 sm:p-5">
      <h2 className="text-lg font-semibold text-violet-100">Pistas orquestales</h2>
      <p className="mt-2 text-xs leading-5 text-emerald-100/65">
        Las pistas tocan a la vez que las órbitas. Puedes superponer acordes,
        sostener violines y contrabajos, o importar un MIDI con todas sus voces.
      </p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-emerald-100/65">
          {tracks.length} pistas · {tracks.reduce((sum, item) => sum + item.notes.length, 0)} notas
        </span>
        <button type="button" disabled={tracks.length >= 24}
          onClick={() => {
            setTracks((items) => [...items, {
              name: "Nueva pista " + (items.length + 1),
              instrument: "violin", notes: [],
              orbit: { duration: period, direction: 1, phase: 0, enabled: true },
            }]);
            onSelectTrack(tracks.length);
            setPage(0);
          }}
          className="rounded-lg border border-violet-300/40 px-3 py-2 text-xs text-violet-100 hover:bg-violet-100/10 disabled:opacity-40">
          + Añadir pista
        </button>
      </div>

      {track && (
        <div className="mt-4 min-w-0 space-y-3 rounded-xl border border-violet-300/20 p-3">
          <label className="block text-xs text-violet-100/80">
            Seleccionar pista
            <select value={selected} onChange={(e) => { onSelectTrack(Number(e.target.value)); setPage(0); }}
              className="mt-1 w-full rounded-lg border border-violet-200/25 bg-[#09271c] p-2 text-emerald-50">
              {tracks.map((item, i) =>
                <option key={i} value={i}>{item.name} ({item.notes.length} notas)</option>)}
            </select>
          </label>
          <label className="block text-xs text-emerald-100/80">
            Nombre
            <input value={track.name} maxLength={80}
              onChange={(e) => updateTrack((item) => ({ ...item, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-emerald-200/20 bg-[#09271c] p-2 text-white" />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-emerald-100/80">
            Instrumento
            <select value={track.instrument}
              onChange={(e) => updateTrack((item) => ({
                ...item, instrument: e.target.value as OrchestralTrack["instrument"],
              }))}
              className="max-w-44 rounded-lg border border-emerald-200/20 bg-[#09271c] p-2 text-white">
              {ORCHESTRAL_INSTRUMENTS.map((name) =>
                <option key={name} value={name}>{NAMES[name]}</option>)}
            </select>
          </label>
          <div className="rounded-xl border border-violet-200/20 bg-[#101d28]/50 p-3">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-violet-100">Movimiento de esta órbita</span>
              <label className="flex items-center gap-2 text-xs text-emerald-100/75">
                <input type="checkbox" checked={track.orbit.enabled}
                  onChange={(event) => updateTrack((item) => ({
                    ...item, orbit: { ...item.orbit, enabled: event.target.checked },
                  }))}
                  className="accent-violet-300" />
                Sonar
              </label>
            </div>
            <label className="block text-xs text-emerald-100/75">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>Tiempo por vuelta</span>
                <span className="font-mono text-violet-200">{track.orbit.duration.toFixed(2)} s</span>
              </span>
              <input type="range" min="2" max="30" step=".05" value={track.orbit.duration}
                aria-label={"Duración de vuelta de " + track.name}
                onChange={(event) => updateOrbit({
                  ...track.orbit, duration: Number(event.target.value),
                })}
                className="mt-2 w-full accent-violet-300" />
            </label>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs text-emerald-100/75">
                Sentido de giro
                <select value={track.orbit.direction}
                  onChange={(event) => updateOrbit({
                    ...track.orbit, direction: Number(event.target.value) as 1 | -1,
                  })}
                  className="mt-1 w-full min-w-0 rounded-lg border border-violet-100/20 bg-[#09271c] p-2 text-white">
                  <option value={1}>Horario ↻</option>
                  <option value={-1}>Antihorario ↺</option>
                </select>
              </label>
              <label className="min-w-0 text-xs text-emerald-100/75">
                Posición inicial: {track.orbit.phase}°
                <input type="range" min="0" max="359" step="1"
                  aria-label={"Posición inicial de " + track.name}
                  value={track.orbit.phase}
                  onChange={(event) => updateOrbit({
                    ...track.orbit, phase: Number(event.target.value),
                  })}
                  className="mt-2 w-full accent-violet-300" />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-emerald-100/55">
              Cambiar velocidad o dirección mueve las notas a nuevos momentos, pero
              conserva sus ángulos y la vuelta a la que pertenecen.
              Las notas de vueltas distintas no se duplican automáticamente.
            </p>
            {orbitError && <p role="alert" className="mt-2 text-xs text-amber-200">{orbitError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={track.notes.length >= 2048}
              onClick={() => {
                updateTrack((item) => ({ ...item, notes: [
                  ...item.notes, { pitch: 60, start: 0, duration: 1, velocity: 100 },
                ] }));
                setPage(Math.floor(track.notes.length / size));
              }}
              className="rounded-lg border border-emerald-200/25 px-3 py-2 text-xs hover:bg-emerald-100/10 disabled:opacity-40">
              Añadir nota
            </button>
            <button type="button"
              onClick={() => {
                setTracks((items) => items.filter((_, index) => index !== selected));
                onSelectTrack(0); setPage(0);
              }}
              className="rounded-lg border border-red-300/30 px-3 py-2 text-xs text-red-200 hover:bg-red-100/10">
              Eliminar pista
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[355px] text-xs">
              <thead className="text-left text-emerald-100/60">
                <tr><th className="p-1">Nota</th><th className="p-1">Inicio</th><th className="p-1">Dura</th><th className="p-1">Fuerza</th><th className="p-1">Quitar</th></tr>
              </thead>
              <tbody>
                {track.notes.slice(safePage * size, (safePage + 1) * size).map((note, offset) => {
                  const index = safePage * size + offset;
                  return (
                    <tr key={index} className="border-t border-emerald-200/10">
                      <td className="p-1">
                        <input type="number" min="21" max="108" step="1"
                          title={pitchFromMidi(note.pitch)} value={note.pitch}
                          aria-label={"Nota MIDI " + (index + 1)}
                          onChange={(e) => updateNote(index, "pitch", Math.max(21, Math.min(108, Math.round(Number(e.target.value)))))}
                          className="w-14 rounded border border-emerald-100/20 bg-[#09271c] p-1 text-white" />
                      </td>
                      <td className="p-1">
                        <input type="number" min="0" max={period - .001} step=".01"
                          value={note.start} aria-label={"Inicio de nota MIDI " + (index + 1)}
                          onChange={(e) => updateNote(index, "start", Math.max(0, Math.min(period - .001, Number(e.target.value))))}
                          className="w-16 rounded border border-emerald-100/20 bg-[#09271c] p-1 text-white" />
                      </td>
                      <td className="p-1">
                        <input type="number" min=".05" max="30" step=".05"
                          value={note.duration} aria-label={"Duración de nota MIDI " + (index + 1)}
                          onChange={(e) => updateNote(index, "duration", Math.max(.05, Math.min(30, Number(e.target.value))))}
                          className="w-16 rounded border border-emerald-100/20 bg-[#09271c] p-1 text-white" />
                      </td>
                      <td className="p-1">
                        <input type="number" min="1" max="127" step="1"
                          value={note.velocity} aria-label={"Fuerza de nota MIDI " + (index + 1)}
                          onChange={(e) => updateNote(index, "velocity", Math.max(1, Math.min(127, Math.round(Number(e.target.value)))))}
                          className="w-14 rounded border border-emerald-100/20 bg-[#09271c] p-1 text-white" />
                      </td>
                      <td className="p-1">
                        <button type="button" aria-label={"Quitar nota " + (index + 1)}
                          onClick={() => {
                            updateTrack((item) => ({ ...item, notes: item.notes.filter((_, i) => i !== index) }));
                            if (offset === 0) setPage(Math.max(0, safePage - 1));
                          }}
                          className="rounded border border-red-200/25 px-2 py-1 text-red-100">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-100/65">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
              className="rounded border border-emerald-200/25 px-2 py-1 disabled:opacity-30">Anterior</button>
            <span>{safePage + 1} / {pages}</span>
            <button type="button" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}
              className="rounded border border-emerald-200/25 px-2 py-1 disabled:opacity-30">Siguiente</button>
          </div>
        </div>
      )}
    </section>
  );
}
