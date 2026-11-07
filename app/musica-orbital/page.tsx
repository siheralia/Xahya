"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { angleDistance, crossedNote, normalizeDegrees, orbitalPoint } from "@/lib/orbital-sequencer.mjs";

const CENTER = 320;
const RINGS = [
  { radius: 274, note: "Do3", hz: 130.81, color: "#36e6a4" },
  { radius: 236, note: "Sol3", hz: 196.0, color: "#73f09b" },
  { radius: 198, note: "Do4", hz: 261.63, color: "#a2f27a" },
  { radius: 160, note: "Mi4", hz: 329.63, color: "#d5ee69" },
  { radius: 122, note: "Sol4", hz: 392.0, color: "#f5dc65" },
  { radius: 84, note: "Do5", hz: 523.25, color: "#ffd17b" },
] as const;

const INITIAL_NOTES = [
  [7, 30, 60, 88, 117, 144, 169, 192, 220, 248, 278, 311, 342],
  [19, 47, 73, 98, 136, 163, 201, 239, 267, 293, 328],
  [11, 46, 82, 120, 156, 191, 218, 252, 286, 318],
  [25, 65, 103, 143, 186, 225, 270, 302, 337],
  [16, 58, 100, 150, 200, 250, 290, 330],
  [30, 76, 123, 171, 218, 265, 311],
];
const INITIAL_PHASES = [0, 8, 352, 12, 5, 348];

function makeNotes() {
  return INITIAL_NOTES.map((ring) => [...ring]);
}

/** Sonido sintetizado localmente: ningún archivo externo ni reproducción automática. */
function playSound(context: AudioContext, frequency: number, volume: number) {
  const at = context.currentTime + 0.005;
  const envelope = context.createGain();
  const fundamental = context.createOscillator();
  const overtone = context.createOscillator();
  const overtoneLevel = context.createGain();
  fundamental.type = "sine";
  fundamental.frequency.setValueAtTime(frequency, at);
  overtone.type = "triangle";
  overtone.frequency.setValueAtTime(frequency * 2, at);
  overtoneLevel.gain.value = 0.12;
  fundamental.connect(envelope);
  overtone.connect(overtoneLevel);
  overtoneLevel.connect(envelope);
  envelope.connect(context.destination);
  const peak = Math.max(0.0001, (volume / 100) * 0.14);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(peak, at + 0.018);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.3), at + 0.22);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.72);
  fundamental.start(at);
  overtone.start(at);
  fundamental.stop(at + 0.74);
  overtone.stop(at + 0.74);
  fundamental.onended = () => {
    fundamental.disconnect();
    overtone.disconnect();
    overtoneLevel.disconnect();
    envelope.disconnect();
  };
}

export default function OrbitalMusicPage() {
  const [notes, setNotes] = useState<number[][]>(makeNotes);
  const [phases, setPhases] = useState<number[]>([...INITIAL_PHASES]);
  const [muted, setMuted] = useState<boolean[]>(RINGS.map(() => false));
  const [secondsPerTurn, setSecondsPerTurn] = useState(12);
  const [volume, setVolume] = useState(55);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const elapsedRef = useRef(0);
  const lastPaintRef = useRef(0);

  const stop = useCallback(() => setPlaying(false), []);

  const togglePlayback = async () => {
    if (playing) {
      stop();
      return;
    }
    try {
      if (!contextRef.current) {
        const AudioContextConstructor = window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) {
          setError("Este navegador no admite la reproducción de audio.");
          return;
        }
        contextRef.current = new AudioContextConstructor();
      }
      await contextRef.current.resume();
      setError("");
      setPlaying(true);
    } catch {
      setError("No se pudo activar el audio. Revisa los permisos del navegador.");
    }
  };

  useEffect(() => {
    return () => {
      if (contextRef.current) void contextRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let animationFrame = 0;
    let previousTime: number | null = null;
    const frame = (time: number) => {
      // Evita una ráfaga de notas pendientes al volver desde una pestaña inactiva.
      const dt = previousTime === null ? 0 : Math.min(0.15, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      const from = elapsedRef.current;
      const to = from + dt;
      elapsedRef.current = to;
      if (dt > 0) {
        RINGS.forEach((ring, ringIndex) => {
          if (muted[ringIndex]) return;
          const offset = phases[ringIndex] / 360;
          const previousTurn = offset + from / secondsPerTurn;
          const currentTurn = offset + to / secondsPerTurn;
          for (const noteAngle of notes[ringIndex]) {
            if (crossedNote(previousTurn, currentTurn, noteAngle) && contextRef.current) {
              playSound(contextRef.current, ring.hz, volume);
            }
          }
        });
      }
      if (time - lastPaintRef.current >= 28) {
        lastPaintRef.current = time;
        setElapsed(to);
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, notes, phases, muted, secondsPerTurn, volume]);

  const resetPlayhead = () => {
    elapsedRef.current = 0;
    setElapsed(0);
  };

  const addNote = (ringIndex: number, event: MouseEvent<SVGCircleElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const angle = normalizeDegrees(Math.atan2(point.y - CENTER, point.x - CENTER) * 180 / Math.PI + 90);
    const rounded = normalizeDegrees(Math.round(angle / 5) * 5);
    setNotes((current) => current.map((ringNotes, index) => {
      if (index !== ringIndex || ringNotes.some((existing) => angleDistance(existing, rounded) < 10)) return ringNotes;
      return [...ringNotes, rounded].sort((a, b) => a - b);
    }));
  };

  const removeNote = (ringIndex: number, noteIndex: number) => {
    setNotes((current) => current.map((ringNotes, index) =>
      index === ringIndex ? ringNotes.filter((_, position) => position !== noteIndex) : ringNotes));
  };

  const shuffleNotes = () => {
    setNotes((current) => current.map((ringNotes) =>
      Array.from({ length: ringNotes.length }, () => Math.floor(Math.random() * 72) * 5)
        .filter((angle, index, all) => all.findIndex((other) => angleDistance(other, angle) < 10) === index)
        .sort((a, b) => a - b)));
  };

  const noteCount = notes.reduce((sum, ring) => sum + ring.length, 0);
  const rotationDegrees = elapsed / secondsPerTurn * 360;

  return (
    <main className="min-h-screen bg-[#03130d] px-4 py-8 text-[#e4ffed] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/70">
            Xahya · Laboratorio musical
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Órbitas sonoras</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100/75 sm:text-base">
            Los puntos luminosos recorren sus anillos. Cuando alcanzan una nota vacía, la iluminan y la hacen sonar.
            Las órbitas comparten la misma duración de vuelta, pero cada una tiene su propio desfase.
          </p>
        </header>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section
            className="min-w-0 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[radial-gradient(circle_at_50%_48%,#1d310b_0%,#08321c_42%,#01160f_75%,#000d08_100%)] p-2 shadow-[0_0_80px_rgba(7,170,71,.09)] sm:p-5"
            aria-label="Secuenciador orbital interactivo"
          >
            <svg
              ref={svgRef}
              viewBox="0 0 640 640"
              className="mx-auto block h-auto w-full max-w-[720px] touch-manipulation"
              role="group"
              aria-label="Pulsa un anillo para añadir notas o una nota vacía para quitarla"
            >
              <defs>
                <radialGradient id="orbital-center-glow">
                  <stop offset="0%" stopColor="#020b08" />
                  <stop offset="76%" stopColor="#0b160b" stopOpacity=".95" />
                  <stop offset="100%" stopColor="#315b1b" stopOpacity=".1" />
                </radialGradient>
                {RINGS.map((ring, index) => (
                  <filter key={index} id={"orbital-glow-" + index} x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                ))}
              </defs>
              <circle cx={CENTER} cy={CENTER} r="282" fill="url(#orbital-center-glow)" />
              {RINGS.map((ring, index) => (
                <g key={"ring-" + index}>
                  <circle cx={CENTER} cy={CENTER} r={ring.radius} fill="none" stroke="#d3ffe2" strokeOpacity={0.78} strokeWidth={2.2} />
                  <circle
                    cx={CENTER} cy={CENTER} r={ring.radius} fill="none"
                    stroke="transparent" strokeWidth={22}
                    className="cursor-crosshair"
                    onClick={(event) => addNote(index, event)}
                    aria-label={"Añadir nota al anillo " + ring.note}
                  />
                  {notes[index].map((angle, noteIndex) => {
                    const point = orbitalPoint(ring.radius, angle);
                    const headAngle = normalizeDegrees(rotationDegrees + phases[index]);
                    const lit = angleDistance(headAngle, angle) < 8 && playing && !muted[index];
                    return (
                      <g key={index + "-" + angle}>
                        {lit && (
                          <circle cx={point.x} cy={point.y} r="17" fill={ring.color} opacity=".65"
                            filter={"url(#orbital-glow-" + index + ")"} />
                        )}
                        <circle
                          cx={point.x} cy={point.y} r={lit ? 11 : 9.3}
                          fill={lit ? ring.color : "#062017"}
                          stroke={lit ? "#fffedb" : "#c8ffe0"} strokeWidth={lit ? 3.5 : 2.5}
                          className="cursor-pointer transition-[fill,stroke] duration-100"
                          role="button" tabIndex={0}
                          aria-label={"Quitar nota " + (noteIndex + 1) + " del anillo " + ring.note}
                          onClick={(event) => { event.stopPropagation(); removeNote(index, noteIndex); }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              removeNote(index, noteIndex);
                            }
                          }}
                        />
                      </g>
                    );
                  })}
                </g>
              ))}
              {RINGS.map((ring, index) => {
                const point = orbitalPoint(ring.radius, rotationDegrees + phases[index]);
                return (
                  <g key={"head-" + index} opacity={muted[index] ? 0.3 : 1}>
                    <circle cx={point.x} cy={point.y} r="16" fill={ring.color} opacity=".7"
                      filter={"url(#orbital-glow-" + index + ")"} />
                    <circle cx={point.x} cy={point.y} r="10" fill={ring.color} stroke="#f3fff0" strokeWidth={2.8} />
                    <circle cx={point.x - 2.5} cy={point.y - 3} r="3.2" fill="#ffffff" opacity=".7" />
                  </g>
                );
              })}
              <circle cx={CENTER} cy={CENTER} r="69" fill="#06100c" fillOpacity="0.92" stroke="#284b2b" strokeWidth="1" />
              <text x={CENTER} y={CENTER - 8} textAnchor="middle" fontSize="11" letterSpacing="3" fill="#a4cdb2">ÓRBITAS</text>
              <text x={CENTER} y={CENTER + 18} textAnchor="middle" fontSize="23" fontWeight="600" fill="#ecffe7">SONORAS</text>
            </svg>
            <p className="px-3 pb-3 text-center text-xs text-emerald-100/60">
              Toca una línea para añadir una nota · Toca un círculo vacío para borrarla
            </p>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Reproducción</h2>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={togglePlayback}
                  className="flex-1 rounded-xl bg-emerald-300 px-4 py-3 font-semibold text-emerald-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200">
                  {playing ? "⏸ Pausar" : "▶ Reproducir"}
                </button>
                <button type="button" onClick={resetPlayhead}
                  className="rounded-xl border border-emerald-200/25 px-4 py-3 text-sm hover:bg-emerald-100/10">
                  Reiniciar
                </button>
              </div>
              {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
              <label className="mt-5 block text-sm">
                <span className="flex justify-between"><span>Duración de cada vuelta</span><span className="font-mono text-emerald-300">{secondsPerTurn} s</span></span>
                <input className="mt-2 w-full accent-emerald-300" type="range"
                  min="4" max="30" step="1" value={secondsPerTurn}
                  onChange={(event) => setSecondsPerTurn(Number(event.target.value))} />
              </label>
              <label className="mt-3 block text-sm">
                <span className="flex justify-between"><span>Volumen</span><span className="font-mono text-emerald-300">{volume}%</span></span>
                <input className="mt-2 w-full accent-emerald-300" type="range"
                  min="0" max="100" step="1" value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))} />
              </label>
              <div className="mt-3 flex justify-between text-xs text-emerald-100/60">
                <span>{noteCount} notas</span><span>{((elapsed / secondsPerTurn) % 1 * 100).toFixed(0)}% de la vuelta</span>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Anillos y desfases</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                De fuera hacia dentro: sonidos graves a agudos. El desfase mueve cada punto sin alterar su velocidad angular.
              </p>
              <div className="mt-4 space-y-4">
                {RINGS.map((ring, index) => (
                  <div key={"settings-" + ring.note} className="border-t border-emerald-100/10 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={!muted[index]}
                          onChange={(event) => setMuted((current) =>
                            current.map((value, i) => i === index ? !event.target.checked : value))}
                          className="accent-emerald-300" aria-label={"Activar sonido de " + ring.note} />
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ring.color }} />
                        {ring.note}
                      </label>
                      <span className="font-mono text-xs text-emerald-100/75">{phases[index]}°</span>
                    </div>
                    <input type="range" min="0" max="359" step="1" value={phases[index]}
                      onChange={(event) => setPhases((current) =>
                        current.map((value, i) => i === index ? Number(event.target.value) : value))}
                      aria-label={"Desfase del anillo " + ring.note}
                      className="mt-2 w-full accent-emerald-300" />
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setPhases(RINGS.map(() => 0))}
                className="mt-4 w-full rounded-lg border border-emerald-200/25 px-3 py-2 text-sm hover:bg-emerald-100/10">
                Alinear todos los puntos
              </button>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Composición</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <button type="button" onClick={shuffleNotes}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Variar notas
                </button>
                <button type="button" onClick={() => setNotes(makeNotes())}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Restaurar
                </button>
                <button type="button" onClick={() => setNotes(RINGS.map(() => []))}
                  className="col-span-2 rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Vaciar circunferencias
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
