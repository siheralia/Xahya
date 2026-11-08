"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ORCHESTRAL_INSTRUMENTS } from "@/lib/orbital-score.mjs";
import type { OrchestralTrack } from "@/lib/orbital-score.mjs";
import { pitchFromMidi } from "@/lib/orbital-orchestra.mjs";

const NAMES: Record<OrchestralTrack["instrument"], string> = {
  violin: "Violín", string_ensemble_1: "Conjunto de cuerdas",
  french_horn: "Trompa", cello: "Violonchelo",
  acoustic_bass: "Contrabajo", distortion_guitar: "Guitarra eléctrica",
  choir_aahs: "Coro", tremolo_strings: "Cuerdas trémolo",
  timpani: "Timbales", brass_section: "Metales", drumkit: "Batería",
};

export default function OrchestralTracksEditor({
  tracks, setTracks, period,
}: {
  tracks: OrchestralTrack[];
  setTracks: Dispatch<SetStateAction<OrchestralTrack[]>>;
  period: number;
}) {
  const [selection, setSelection] = useState(0);
  const [page, setPage] = useState(0);
  const selected = Math.min(selection, Math.max(0, tracks.length - 1));
  const track = tracks[selected];
  const size = 10;
  const pages = Math.max(1, Math.ceil((track?.notes.length ?? 0) / size));
  const safePage = Math.min(page, pages - 1);

  const updateTrack = (fn: (track: OrchestralTrack) => OrchestralTrack) => {
    setTracks((items) => items.map((item, i) => i === selected ? fn(item) : item));
  };
  const updateNote = (index: number, field: "pitch" | "start" | "duration" | "velocity", value: number) => {
    updateTrack((item) => ({
      ...item, notes: item.notes.map((note, i) => i === index ? { ...note, [field]: value } : note),
    }));
  };

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-violet-950/15 p-5">
      <h2 className="text-lg font-semibold text-violet-100">Pistas orquestales</h2>
      <p className="mt-2 text-xs leading-5 text-emerald-100/65">
        Las pistas tocan a la vez que las órbitas. Puedes superponer acordes,
        sostener violines y contrabajos, o importar un MIDI con todas sus voces.
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-emerald-100/65">
          {tracks.length} pistas · {tracks.reduce((sum, item) => sum + item.notes.length, 0)} notas
        </span>
        <button type="button" disabled={tracks.length >= 24}
          onClick={() => {
            setTracks((items) => [...items, {
              name: "Nueva pista " + (items.length + 1),
              instrument: "violin", notes: [],
            }]);
            setSelection(tracks.length);
            setPage(0);
          }}
          className="rounded-lg border border-violet-300/40 px-3 py-2 text-xs text-violet-100 hover:bg-violet-100/10 disabled:opacity-40">
          + Añadir pista
        </button>
      </div>

      {track && (
        <div className="mt-4 space-y-3 rounded-xl border border-violet-300/20 p-3">
          <label className="block text-xs text-violet-100/80">
            Seleccionar pista
            <select value={selected} onChange={(e) => { setSelection(Number(e.target.value)); setPage(0); }}
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
                setSelection(0); setPage(0);
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
