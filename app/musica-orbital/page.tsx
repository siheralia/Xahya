"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { angleDistance, crossedOrbitalNote, normalizeDegrees, orbitalPoint, orbitalTurnAt } from "@/lib/orbital-sequencer.mjs";
import { createGoldenScore, parseOrbitalScore, SCORE_FORMAT } from "@/lib/orbital-score.mjs";
import type { OrbitalScore } from "@/lib/orbital-score.mjs";

const CENTER = 450;
const SCORE_STORAGE_KEY = "xahya.orbital-scores.v1";
// Afinación temperada con La4 = 440 Hz. Mayor radio = nota más aguda.
// Los 4 anillos centrales conservan el primer recorrido; los exteriores el segundo.
// Fa♯5 añade el semitono que necesita la melodía importable.
const RINGS = [
  { radius: 96, pitch: "C4", note: "Do4", hz: 261.6256, color: "#ffd37c" },
  { radius: 118, pitch: "D4", note: "Re4", hz: 293.6648, color: "#f7d768" },
  { radius: 140, pitch: "E4", note: "Mi4", hz: 329.6276, color: "#e8df65" },
  { radius: 162, pitch: "F4", note: "Fa4", hz: 349.2282, color: "#cee870" },
  { radius: 184, pitch: "G4", note: "Sol4", hz: 391.9954, color: "#b2e97b" },
  { radius: 206, pitch: "A4", note: "La4", hz: 440, color: "#91ea86" },
  { radius: 228, pitch: "B4", note: "Si4", hz: 493.8833, color: "#7ee899" },
  { radius: 250, pitch: "C5", note: "Do5", hz: 523.2511, color: "#6aeca5" },
  { radius: 272, pitch: "D5", note: "Re5", hz: 587.3295, color: "#61eeb8" },
  { radius: 294, pitch: "E5", note: "Mi5", hz: 659.2551, color: "#54dfc8" },
  { radius: 316, pitch: "F5", note: "Fa5", hz: 698.4565, color: "#4bd4cf" },
  { radius: 338, pitch: "F#5", note: "Fa♯5", hz: 739.9888, color: "#42d0d8" },
  { radius: 360, pitch: "G5", note: "Sol5", hz: 783.9909, color: "#5bd5e9" },
  { radius: 382, pitch: "A5", note: "La5", hz: 880, color: "#7bc8f4" },
  { radius: 404, pitch: "B5", note: "Si5", hz: 987.7666, color: "#9cb7ff" },
  { radius: 426, pitch: "C6", note: "Do6", hz: 1046.5023, color: "#c1aaff" },
] as const;

// Notas fijas iniciales, de dentro hacia fuera.
const INITIAL_NOTES = [
  [30, 75, 120, 170, 220, 268, 310],
  [15, 60, 110, 155, 204, 248, 293, 335],
  [20, 65, 100, 143, 185, 228, 270, 315],
  [25, 65, 103, 143, 186, 225, 270, 302, 337],
  [11, 46, 82, 120, 156, 191, 218, 252, 286, 318],
  [19, 47, 73, 98, 136, 163, 201, 239, 267, 293, 328],
  [7, 30, 60, 88, 117, 144, 169, 192, 220, 248, 278, 311, 342],
  [], [], [], [], [], [], [], [], [],
];
// Cada grupo tiene su propia zona de partida, como en el gráfico de referencia.
const INITIAL_PHASES = [354, 2, 9, 16, 83, 90, 97, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const INITIAL_DELAYS = [0, 0.5, 1, 1.5, 0, 0.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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
  const [groupDurations, setGroupDurations] = useState<[number, number]>([12, 12]);
  const [groupDirections, setGroupDirections] = useState<[1 | -1, 1 | -1]>([1, -1]);
  const [startDelays, setStartDelays] = useState<number[]>([...INITIAL_DELAYS]);
  const [volume, setVolume] = useState(55);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [scoreName, setScoreName] = useState("Mi partitura");
  const [savedScores, setSavedScores] = useState<OrbitalScore[]>([]);
  const [selectedScore, setSelectedScore] = useState("");
  const [scoreMessage, setScoreMessage] = useState("");
  const [expandedRing, setExpandedRing] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const elapsedRef = useRef(0);
  const lastPaintRef = useRef(0);

  // Composiciones personales guardadas localmente: no consumen base de datos.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCORE_STORAGE_KEY);
      if (!raw) return;
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return;
      const valid: OrbitalScore[] = [];
      for (const entry of value.slice(0, 30)) {
        try {
          valid.push(parseOrbitalScore(entry));
        } catch {
          // Ignorar solamente la partitura dañada.
        }
      }
      setSavedScores(valid);
    } catch {
      setScoreMessage("No se pudieron leer las partituras guardadas en este navegador.");
    }
  }, []);

  function createCurrentScore(): OrbitalScore {
    return parseOrbitalScore({
      format: SCORE_FORMAT,
      version: 1,
      title: scoreName.trim() || "Mi partitura",
      groups: groupDurations.map((duration, group) => ({
        duration, direction: groupDirections[group],
      })),
      rings: RINGS.map((ring, index) => ({
        pitch: ring.pitch,
        enabled: !muted[index],
        phase: phases[index],
        delay: startDelays[index],
        angles: notes[index],
      })),
    });
  }

  function loadScore(score: OrbitalScore) {
    const safe = parseOrbitalScore(score);
    setPlaying(false);
    elapsedRef.current = 0;
    setElapsed(0);
    setNotes(safe.rings.map((ring) => [...ring.angles]));
    setPhases(safe.rings.map((ring) => ring.phase));
    setStartDelays(safe.rings.map((ring) => ring.delay));
    setMuted(safe.rings.map((ring) => !ring.enabled));
    setGroupDurations([safe.groups[0].duration, safe.groups[1].duration]);
    setGroupDirections([safe.groups[0].direction, safe.groups[1].direction]);
    setScoreName(safe.title);
    setScoreMessage('Partitura cargada: "' + safe.title + '". Pulsa Reproducir para escucharla.');
  }

  function saveScore() {
    try {
      const score = createCurrentScore();
      const next = [...savedScores.filter((item) => item.title !== score.title), score].slice(-30);
      window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
      setSavedScores(next);
      setSelectedScore(score.title);
      setScoreMessage('Partitura guardada en este navegador: "' + score.title + '".');
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo guardar la partitura.");
    }
  }

  function removeSavedScore() {
    if (!selectedScore) return;
    try {
      const next = savedScores.filter((score) => score.title !== selectedScore);
      window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
      setSavedScores(next);
      setSelectedScore("");
      setScoreMessage("Partitura guardada eliminada del navegador.");
    } catch {
      setScoreMessage("No se pudo eliminar la partitura guardada.");
    }
  }

  function exportScore() {
    try {
      const score = createCurrentScore();
      const json = JSON.stringify(score, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (score.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) || "partitura") + ".json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setScoreMessage("Partitura exportada en formato JSON.");
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo exportar la partitura.");
    }
  }

  async function importScore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setScoreMessage("El archivo JSON es demasiado grande (máximo: 1 MB).");
      return;
    }
    try {
      const raw: unknown = JSON.parse(await file.text());
      const score = parseOrbitalScore(raw);
      loadScore(score);
      setSelectedScore("");
      setScoreMessage('Partitura importada: "' + score.title + '". Usa Guardar para conservarla aquí.');
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo importar el archivo JSON.");
    }
  }

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
          const group = ringIndex < 4 ? 0 : 1;
          const delay = startDelays[ringIndex];
          const previousTurn = orbitalTurnAt(
            Math.max(from, delay), delay, phases[ringIndex], groupDurations[group], groupDirections[group]
          );
          const currentTurn = orbitalTurnAt(
            to, delay, phases[ringIndex], groupDurations[group], groupDirections[group]
          );
          for (const noteAngle of notes[ringIndex]) {
            if (crossedOrbitalNote(previousTurn, currentTurn, noteAngle) && contextRef.current) {
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
  }, [playing, notes, phases, muted, groupDurations, groupDirections, startDelays, volume]);

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
  const ringTurn = (ringIndex: number) => {
    const group = ringIndex < 4 ? 0 : 1;
    return orbitalTurnAt(
      elapsed, startDelays[ringIndex], phases[ringIndex], groupDurations[group], groupDirections[group]
    );
  };

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
            Dieciséis órbitas musicales, desde Do4 hasta Do6: las notas más agudas están en el exterior.
            Puedes editar los dos recorridos, encender o apagar anillos y guardar partituras.
          </p>
        </header>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section
            className="min-w-0 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[radial-gradient(circle_at_50%_48%,#1d310b_0%,#08321c_42%,#01160f_75%,#000d08_100%)] p-2 shadow-[0_0_80px_rgba(7,170,71,.09)] sm:p-5"
            aria-label="Secuenciador orbital interactivo"
          >
            <svg
              ref={svgRef}
              viewBox="0 0 900 900"
              className="mx-auto block h-auto w-full max-w-[900px] touch-manipulation"
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
              <circle cx={CENTER} cy={CENTER} r="436" fill="url(#orbital-center-glow)" />
              {RINGS.map((ring, index) => (
                <g key={"ring-" + index} opacity={muted[index] ? 0.12 : 1}>
                  <circle cx={CENTER} cy={CENTER} r={ring.radius} fill="none" stroke="#d3ffe2" strokeOpacity={0.78} strokeWidth={2.2} />
                  <circle
                    cx={CENTER} cy={CENTER} r={ring.radius} fill="none"
                    stroke="transparent" strokeWidth={16}
                    className={muted[index] ? "pointer-events-none" : "cursor-crosshair"}
                    onClick={(event) => addNote(index, event)}
                    aria-label={"Añadir nota al anillo " + ring.note}
                  />
                  {notes[index].map((angle, noteIndex) => {
                    const point = orbitalPoint(ring.radius, angle, CENTER);
                    const turn = ringTurn(index);
                    const headAngle = normalizeDegrees((turn ?? phases[index] / 360) * 360);
                    const lit = turn !== null && angleDistance(headAngle, angle) < 8 && playing && !muted[index];
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
                          role="button" tabIndex={muted[index] ? -1 : 0}
                          aria-label={"Quitar nota " + (noteIndex + 1) + " del anillo " + ring.note}
                          onClick={(event) => { event.stopPropagation(); if (!muted[index]) removeNote(index, noteIndex); }}
                          onKeyDown={(event) => {
                            if (!muted[index] && (event.key === "Enter" || event.key === " ")) {
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
                const turn = ringTurn(index);
                const point = orbitalPoint(ring.radius, (turn ?? phases[index] / 360) * 360, CENTER);
                return (
                  <g key={"head-" + index} opacity={muted[index] ? 0 : turn === null ? 0.5 : 1}>
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
              <label className="mt-3 block text-sm">
                <span className="flex justify-between"><span>Volumen</span><span className="font-mono text-emerald-300">{volume}%</span></span>
                <input className="mt-2 w-full accent-emerald-300" type="range"
                  min="0" max="100" step="1" value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))} />
              </label>
              <div className="mt-3 flex justify-between text-xs text-emerald-100/60">
                <span>{noteCount} notas</span><span>Tiempo: {elapsed.toFixed(1)} s</span>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Dos recorridos</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                Los cuatro anillos centrales siguen un recorrido y los doce exteriores siguen otro.
                Dentro de cada grupo todos tardan lo mismo en completar una vuelta.
              </p>
              {(["Interiores · Do4 a Fa4", "Exteriores · Sol4 a Do6"] as const).map((label, group) => (
                <div key={label} className="mt-4 border-t border-emerald-100/10 pt-3">
                  <h3 className="text-sm font-medium">{label}</h3>
                  <label className="mt-3 block text-xs">
                    <span className="flex justify-between gap-3">
                      <span>Duración de la vuelta</span>
                      <span className="font-mono text-emerald-300">{groupDurations[group]} s</span>
                    </span>
                    <input className="mt-2 w-full accent-emerald-300" type="range" min="4" max="30" step="1"
                      value={groupDurations[group]} onChange={(event) => setGroupDurations((current) => {
                        const next: [number, number] = [...current];
                        next[group] = Number(event.target.value);
                        return next;
                      })} />
                  </label>
                  <label className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <span>Sentido</span>
                    <select value={groupDirections[group]} onChange={(event) => setGroupDirections((current) => {
                      const next: [1 | -1, 1 | -1] = [...current];
                      next[group] = Number(event.target.value) as 1 | -1;
                      return next;
                    })}
                      className="rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-1.5 text-emerald-50">
                      <option value={1}>Horario ↻</option>
                      <option value={-1}>Antihorario ↺</option>
                    </select>
                  </label>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Anillos e inicio</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                Cada círculo tiene su propia nota, posición y retraso de inicio.
                Desmarcar el interruptor apaga el círculo sin borrar sus notas.
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
                    <label className="mt-2 block text-xs text-emerald-100/65">
                      Posición inicial
                      <input type="range" min="0" max="359" step="1" value={phases[index]}
                        onChange={(event) => setPhases((current) =>
                          current.map((value, i) => i === index ? Number(event.target.value) : value))}
                        aria-label={"Posición inicial del anillo " + ring.note}
                        className="mt-1 w-full accent-emerald-300" />
                    </label>
                    <label className="mt-2 block text-xs text-emerald-100/65">
                      <span className="flex justify-between gap-2">
                        <span>Comenzar tras</span>
                        <span className="font-mono text-emerald-300">{startDelays[index]} s</span>
                      </span>
                      <input type="range" min="0" max="30" step="0.5" value={startDelays[index]}
                        onChange={(event) => setStartDelays((current) =>
                          current.map((value, i) => i === index ? Number(event.target.value) : value))}
                        aria-label={"Retraso de inicio del anillo " + ring.note}
                        className="mt-1 w-full accent-emerald-300" />
                    </label>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setPhases(RINGS.map(() => 0))}
                className="mt-4 w-full rounded-lg border border-emerald-200/25 px-3 py-2 text-sm hover:bg-emerald-100/10">
                Alinear puntos de partida
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
