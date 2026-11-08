"use client";

import { memo, useMemo, useRef } from "react";
import type { MouseEvent } from "react";
import type { OrchestralTrack } from "@/lib/orbital-score.mjs";
import { orbitalPoint } from "@/lib/orbital-sequencer.mjs";
import {
  normalizeOrbitAngle, orbitPositionForNote, orbitTimeForAngle,
} from "@/lib/orbital-instrument-rings.mjs";
import { pitchFromMidi } from "@/lib/orbital-orchestra.mjs";
import { orbitTrackLabel, orbitTrackRole, ORBIT_INSTRUMENT_SHORT_NAMES } from "@/lib/orbital-track-labels.mjs";

const CENTER = 450;
const PALETTE = [
  "#f9ce7c", "#e5a3b9", "#a6db96", "#98d6e3",
  "#cbb0fa", "#f1c88a", "#9ce1be", "#efb79a",
  "#e0a6d3", "#8bcadf", "#ead8ac", "#b8c5ff",
];
const ringRadius = (index: number, count: number) =>
  count === 1 ? 285 : 115 + index * (310 / Math.max(1, count - 1));

function SustainMarkers({ track, radius, color, selected, index }: {
  track: OrchestralTrack;
  radius: number;
  color: string;
  selected: boolean;
  index: number;
}) {
  // Static notes are memoized separately from moving orbital heads.
  return (
    <g opacity={selected ? 1 : .67} pointerEvents="none">
      {track.notes.map((note, j) => {
        const { angle, lap } = orbitPositionForNote(note, track.orbit);
        const offset = ((note.pitch % 5) - 2) * 1.5;
        const point = orbitalPoint(radius + offset, angle, CENTER);
        const sweep = Math.min(359.5, 360 * note.duration / track.orbit.duration);
        const end = orbitalPoint(radius + offset,
          angle + track.orbit.direction * sweep, CENTER);
        const largeArc = sweep > 180 ? 1 : 0;
        const clockwise = track.orbit.direction === 1 ? 1 : 0;
        return (
          <g key={j}>
            {selected && (
              <path d={"M " + point.x + " " + point.y + " A " +
                (radius + offset) + " " + (radius + offset) +
                " 0 " + largeArc + " " + clockwise + " " + end.x + " " + end.y}
                fill="none" stroke={color} strokeOpacity=".48" strokeWidth="3.5"
                strokeLinecap="round" />
            )}
            <circle cx={point.x} cy={point.y} r={selected ? 5.1 : 3.4}
              fill={color} fillOpacity={lap % 2 === 0 ? 1 : .7}
              stroke={selected ? "#f2fff6" : "none"} strokeWidth={selected ? .8 : 0}>
              <title>{track.name + " · " + pitchFromMidi(note.pitch) +
                " · " + note.start.toFixed(2) + " s · vuelta " + (lap + 1)}</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
const StaticNotes = memo(SustainMarkers);

export default function InstrumentOrbitCanvas({
  tracks, elapsed, masterDuration, playing, selectedTrack, onSelect, onAdd,
}: {
  tracks: OrchestralTrack[];
  elapsed: number;
  masterDuration: number;
  playing: boolean;
  selectedTrack: number;
  onSelect: (index: number) => void;
  onAdd: (index: number, start: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const palette = useMemo(() => tracks.map((_, i) => PALETTE[i % PALETTE.length]), [tracks.length]);
  const selected = tracks[Math.min(selectedTrack, tracks.length - 1)];
  const selectedLabel = selected ? orbitTrackLabel(selected) : "Órbita instrumental";
  const selectedShort = selected
    ? ORBIT_INSTRUMENT_SHORT_NAMES[selected.instrument] ?? "INSTRUMENTO"
    : "ORQUESTA";
  const selectedRole = selected ? orbitTrackRole(selected) : "Pistas musicales";
  const addAtPosition = (index: number, event: MouseEvent<SVGCircleElement>) => {
    event.stopPropagation();
    if (selectedTrack !== index) { onSelect(index); return; }
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const angle = normalizeOrbitAngle(Math.atan2(point.y - CENTER, point.x - CENTER) * 180 / Math.PI + 90);
    const orbit = tracks[index].orbit;
    const lap = Math.floor(((elapsed % masterDuration) + 1e-8) / orbit.duration);
    const start = Number(orbitTimeForAngle(angle, orbit, lap).toFixed(5));
    if (start < masterDuration) onAdd(index, start);
  };

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-violet-300/20 bg-[radial-gradient(circle_at_50%_48%,#19273b_0%,#0a2220_45%,#01140f_85%)] p-2 sm:p-4"
      aria-label="Órbitas de instrumentos: notas y acordes por pista">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-2 py-2 text-xs text-emerald-100/80">
        <span>{tracks.length} órbitas instrumentales · acordes y notas sostenidas</span>
        <span>Vuelta de la pieza: {masterDuration.toFixed(1)} s</span>
      </div>
      {selected && (
        <div role="status" aria-live="polite"
          className="mx-2 mb-2 min-w-0 rounded-xl border border-violet-300/25 bg-[#0e1c26]/80 px-3 py-2">
          <p className="break-words text-sm font-semibold text-violet-100">
            Anillo {Math.min(selectedTrack, tracks.length - 1) + 1} · {selectedLabel}
          </p>
          <p className="mt-1 break-words text-xs text-emerald-100/65">
            {selected.name} · {selected.notes.length} notas · {selected.orbit.duration.toFixed(2)} s/vuelta
          </p>
        </div>
      )}
      <svg ref={svgRef} viewBox="0 0 900 900" role="group"
        className="mx-auto block h-auto w-full max-w-full touch-manipulation"
        aria-label="Toca un anillo para seleccionarlo; vuelve a tocarlo para añadir una nota">
        <circle cx={CENTER} cy={CENTER} r="438" fill="none" stroke="#49656b" strokeOpacity=".5" />
        {tracks.map((track, i) => {
          const radius = ringRadius(i, tracks.length);
          const selected = i === selectedTrack;
          const color = palette[i];
          const motion = track.orbit;
          return (
            <g key={"orbit-" + i} opacity={motion.enabled ? 1 : .2}>
              <circle cx={CENTER} cy={CENTER} r={radius} fill="none"
                stroke={selected ? color : "#9eb6b1"}
                strokeWidth={selected ? 2.9 : 1.65} strokeOpacity={selected ? .9 : .55} />
              <StaticNotes track={track} radius={radius} color={color}
                selected={selected} index={i} />
              <circle cx={CENTER} cy={CENTER} r={radius} fill="none"
                stroke="transparent" strokeWidth={18}
                className="cursor-pointer" onClick={(event) => addAtPosition(i, event)}>
                <title>{track.name + " · " + motion.duration.toFixed(2) +
                  " s/vuelta · " + track.notes.length + " notas"}</title>
              </circle>
            </g>
          );
        })}
        {tracks.map((track, i) => {
          const radius = ringRadius(i, tracks.length);
          const motion = track.orbit;
          const turnAngle = normalizeOrbitAngle(motion.phase +
            motion.direction * (((elapsed % masterDuration) / motion.duration) * 360));
          const point = orbitalPoint(radius, turnAngle, CENTER);
          if (!motion.enabled) return null;
          return (
            <g key={"head-" + i} pointerEvents="none"
              opacity={playing ? 1 : .7}>
              <circle cx={point.x} cy={point.y} r={i === selectedTrack ? 12 : 7.5}
                fill={palette[i]} opacity=".35" />
              <circle cx={point.x} cy={point.y} r={i === selectedTrack ? 7.8 : 5.5}
                fill={palette[i]} stroke="#ffffff" strokeWidth="1.8" />
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r="92" fill="#05120f" stroke="#608f7f"
          strokeOpacity=".55" />
        <text x={CENTER} y={CENTER - 22} fontSize="12" fill="#b4ead5"
          textAnchor="middle" letterSpacing="1.5">ANILLO SELECCIONADO</text>
        <text x={CENTER} y={CENTER + 4} fontSize="17" fill="#f0ffef"
          fontWeight="600" textAnchor="middle">{selectedShort}</text>
        <text x={CENTER} y={CENTER + 26} fontSize="12" fill="#d8d9f4"
          textAnchor="middle">{selectedRole}</text>
      </svg>
      <p className="px-2 pb-3 text-center text-xs leading-5 text-emerald-100/65">
        El centro muestra qué instrumento y parte musical estás editando.
        Toca otro círculo para seleccionarlo; tócalo de nuevo para añadir una
        nota en la vuelta actual y edítala en la lista inferior.
        Los puntos de distintas vueltas pueden compartir ángulo sin sonar simultáneamente.
      </p>
    </section>
  );
}
