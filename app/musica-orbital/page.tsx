"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { angleDistance, normalizeDegrees, orbitalPoint, orbitalTurnAt } from "@/lib/orbital-sequencer.mjs";
import { BATTLE_TURN_SECONDS, createBattleThemeScore, pitchFrequency } from "@/lib/orbital-theme.mjs";
import { elapsedSlideProgress, orbitalEventsBetween, orbitalPercussionBetween, playOrbitalSound, playOrbitalPercussion } from "@/lib/orbital-playback.mjs";
import { createGoldenScore, parseOrbitalScore, SCORE_FORMAT, RING_INSTRUMENTS } from "@/lib/orbital-score.mjs";
import type { OrbitalScore, OrbitalSlide, OrbitalNoteLength, OrbitalInstrument, OrchestralTrack } from "@/lib/orbital-score.mjs";
import { importOrbitalMidi } from "@/lib/orbital-midi.mjs";
import { midiFromPitch, orchestralEventsBetween, playOrchestralNote, prepareOrchestralInstruments, stopOrchestralVoices } from "@/lib/orbital-orchestra.mjs";
import OrchestralTracksEditor from "@/components/music/OrchestralTracksEditor";

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

const BATTLE_SCORE = createBattleThemeScore();
const INSTRUMENT_LABELS: Record<OrbitalInstrument, string> = {
  synth: "Sintetizador orbital",
  violin: "Violín", string_ensemble_1: "Conjunto de cuerdas",
  french_horn: "Trompa", cello: "Violonchelo",
  acoustic_bass: "Contrabajo", distortion_guitar: "Guitarra eléctrica",
  choir_aahs: "Coro", tremolo_strings: "Cuerdas trémolo",
  timpani: "Timbales", brass_section: "Metales", drumkit: "Batería",
};
const ORCHESTRA_OPTIONS = RING_INSTRUMENTS.filter((name) => name !== "synth");

function makeNotes() {
  return BATTLE_SCORE.rings.map((ring) => [...ring.angles]);
}

export default function OrbitalMusicPage() {
  const [notes, setNotes] = useState<number[][]>(makeNotes);
  const [slides, setSlides] = useState<OrbitalSlide[][]>(() => BATTLE_SCORE.rings.map((ring) => [...ring.slides]));
  const [noteLengths, setNoteLengths] = useState<OrbitalNoteLength[][]>(() => BATTLE_SCORE.rings.map((ring) => [...ring.noteLengths]));
  const [ringInstruments, setRingInstruments] = useState<OrbitalInstrument[]>(() => BATTLE_SCORE.rings.map((ring) => ring.instrument));
  const [tracks, setTracks] = useState<OrchestralTrack[]>(() => BATTLE_SCORE.tracks);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [phases, setPhases] = useState<number[]>(() => BATTLE_SCORE.rings.map((ring) => ring.phase));
  const [muted, setMuted] = useState<boolean[]>(() => BATTLE_SCORE.rings.map((ring) => !ring.enabled));
  const [groupDurations, setGroupDurations] = useState<[number, number]>([BATTLE_TURN_SECONDS, BATTLE_TURN_SECONDS]);
  const [groupDirections, setGroupDirections] = useState<[1 | -1, 1 | -1]>([1, 1]);
  const [ringDurations, setRingDurations] = useState<number[]>(() => BATTLE_SCORE.rings.map((ring) => ring.duration));
  const [ringDirections, setRingDirections] = useState<Array<1 | -1>>(() => BATTLE_SCORE.rings.map((ring) => ring.direction));
  const [percussion, setPercussion] = useState<"none" | "battle">(BATTLE_SCORE.percussion);
  const [startDelays, setStartDelays] = useState<number[]>(() => BATTLE_SCORE.rings.map((ring) => ring.delay));
  const [volume, setVolume] = useState(55);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [scoreName, setScoreName] = useState(BATTLE_SCORE.title);
  const [ownTheme, setOwnTheme] = useState<OrbitalScore | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [slideRing, setSlideRing] = useState("B5");
  const [slideAngle, setSlideAngle] = useState(String(BATTLE_SCORE.rings.find((ring) => ring.pitch === "B5")?.slides[0]?.angle ?? ""));
  const [slideTarget, setSlideTarget] = useState("C6");
  const [slideDuration, setSlideDuration] = useState(0.15);
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

  // The shared account soundtrack is distinct from local drafts.
  useEffect(() => {
    let alive = true;
    fetch("/api/music-theme", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el tema de la cuenta.");
        return response.json();
      })
      .then((data) => {
        if (alive && data.theme) setOwnTheme(parseOrbitalScore(data.theme));
      })
      .catch(() => {
        if (alive) setScoreMessage("No se pudo consultar tu tema guardado en la cuenta.");
      });
    return () => { alive = false; };
  }, []);

  async function savePersonalTheme() {
    setThemeBusy(true);
    try {
      const response = await fetch("/api/music-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createCurrentScore()),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar tu tema.");
      setOwnTheme(parseOrbitalScore(data.theme));
      setScoreMessage("Tu tema personal quedó guardado para tus próximos combates.");
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo guardar tu tema.");
    } finally {
      setThemeBusy(false);
    }
  }

  async function resetPersonalTheme() {
    setThemeBusy(true);
    try {
      const response = await fetch("/api/music-theme", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo restaurar el tema predeterminado.");
      setOwnTheme(null);
      setScoreMessage("Tu cuenta vuelve a utilizar Ascenso de Xahya en combate.");
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo restaurar el tema.");
    } finally {
      setThemeBusy(false);
    }
  }

  const slideRingIndex = RINGS.findIndex((ring) => ring.pitch === slideRing);
  const slideOptions = notes[slideRingIndex] ?? [];
  const chosenAngle = slideOptions.includes(Number(slideAngle)) ? Number(slideAngle) : slideOptions[0];
  const allSlides = slides.flatMap((items, index) => items.map((slide) => ({
    ...slide, index, source: RINGS[index].note,
  })));

  function upsertSlide() {
    if (slideRingIndex < 0 || chosenAngle === undefined) {
      setScoreMessage("Añade primero una nota a la circunferencia de origen.");
      return;
    }
    if (slideTarget === slideRing) {
      setScoreMessage("El destino del deslizamiento debe ser otra nota.");
      return;
    }
    const slide: OrbitalSlide = { angle: chosenAngle, toPitch: slideTarget, duration: slideDuration };
    setSlides((current) => current.map((entries, index) =>
      index !== slideRingIndex ? entries : [
        ...entries.filter((entry) => entry.angle !== chosenAngle), slide,
      ]));
    setScoreMessage("Deslizamiento creado. El tono cambiará gradualmente al pasar por esa nota.");
  }

  function removeSlide(index: number, angle: number) {
    setSlides((current) => current.map((entries, i) =>
      i !== index ? entries : entries.filter((slide) => slide.angle !== angle)));
  }

  function createCurrentScore(): OrbitalScore {
    return parseOrbitalScore({
      format: SCORE_FORMAT,
      version: 1,
      title: scoreName.trim() || "Mi partitura",
      percussion,
      tracks,
      groups: groupDurations.map((duration, group) => ({
        duration, direction: groupDirections[group],
      })),
      rings: RINGS.map((ring, index) => ({
        pitch: ring.pitch,
        enabled: !muted[index],
        phase: phases[index],
        delay: startDelays[index],
        duration: ringDurations[index],
        direction: ringDirections[index],
        instrument: ringInstruments[index],
        angles: notes[index],
        noteLengths: noteLengths[index],
        slides: slides[index],
      })),
    });
  }

  // MIDI scores contain hundreds of notes. Validate/normalize only when the
  // musical content changes, not during every animation frame.
  const playbackScore = useMemo(() => {
    // The user may temporarily clear a track name while editing. Report
    // validation in the controls instead of crashing the whole editor.
    try { return createCurrentScore(); } catch { return null; }
  }, [
    notes, slides, noteLengths, ringInstruments, tracks, phases, muted,
    groupDurations, groupDirections, ringDurations, ringDirections, startDelays,
    percussion, scoreName,
  ]);

  function loadScore(score: OrbitalScore) {
    const safe = parseOrbitalScore(score);
    setPlaying(false);
    elapsedRef.current = 0;
    setElapsed(0);
    setNotes(safe.rings.map((ring) => [...ring.angles]));
    setSlides(safe.rings.map((ring) => [...ring.slides]));
    setNoteLengths(safe.rings.map((ring) => [...ring.noteLengths]));
    setRingInstruments(safe.rings.map((ring) => ring.instrument));
    setTracks(safe.tracks);
    setPhases(safe.rings.map((ring) => ring.phase));
    setStartDelays(safe.rings.map((ring) => ring.delay));
    setMuted(safe.rings.map((ring) => !ring.enabled));
    setRingDurations(safe.rings.map((ring) => ring.duration));
    setRingDirections(safe.rings.map((ring) => ring.direction));
    setPercussion(safe.percussion);
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

  async function importMidi(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const score = importOrbitalMidi(await file.arrayBuffer(), file.name.replace(/\.mid(i)?$/i, "").slice(0, 120));
      loadScore(score);
      setScoreMessage("MIDI cargado con sus pistas, acordes y duraciones originales.");
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo importar el MIDI.");
    }
  }

  async function loadCorona() {
    try {
      setThemeBusy(true);
      const response = await fetch("/music/corona-de-cenizas.mid.gz.b64");
      if (!response.ok) throw new Error("No se encontró la partitura orquestal.");
      if (typeof DecompressionStream === "undefined") {
        throw new Error("Este navegador no puede abrir la partitura comprimida. Puedes importar el MIDI manualmente.");
      }
      const encoded = (await response.text()).trim();
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const decoded = new Response(new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream("gzip")));
      loadScore(importOrbitalMidi(await decoded.arrayBuffer(), "Corona de Cenizas — orquestal"));
      setScoreMessage("Corona de Cenizas cargada como pistas orquestales editables.");
    } catch (cause) {
      setScoreMessage(cause instanceof Error ? cause.message : "No se pudo cargar el tema.");
    } finally {
      setThemeBusy(false);
    }
  }

  const stop = useCallback(() => {
    setPlaying(false);
    stopOrchestralVoices(contextRef.current);
  }, []);

  const togglePlayback = async () => {
    if (playing || loadingSounds) {
      if (playing) stop();
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
      if (!playbackScore) {
        setError("Revisa los nombres, tiempos y duraciones de las pistas antes de reproducir.");
        return;
      }
      setLoadingSounds(true);
      const availability = await prepareOrchestralInstruments(contextRef.current, playbackScore);
      await contextRef.current.resume();
      setLoadingSounds(false);
      if (availability.fallback) {
        setScoreMessage("Algunos instrumentos no cargaron sus muestras; se usará síntesis local.");
      }
      setError("");
      setPlaying(true);
    } catch {
      setError("No se pudo activar el audio. Revisa los permisos del navegador.");
    } finally {
      setLoadingSounds(false);
    }
  };

  useEffect(() => {
    return () => {
      stopOrchestralVoices(contextRef.current);
      if (contextRef.current) void contextRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!playing || !playbackScore) return;
    let animationFrame = 0;
    let previousTime: number | null = null;
    const frame = (time: number) => {
      // Evita una ráfaga de notas pendientes al volver desde una pestaña inactiva.
      const dt = previousTime === null ? 0 : Math.min(0.15, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      const from = elapsedRef.current;
      const to = from + dt;
      elapsedRef.current = to;
      if (dt > 0 && contextRef.current) {
        const score = playbackScore;
        for (const note of orbitalEventsBetween(score, from, to)) {
          if (note.instrument === "synth") {
            playOrbitalSound(contextRef.current, pitchFrequency(note.pitch), volume,
              note.toPitch ? pitchFrequency(note.toPitch) : null, note.duration, note.length);
          } else {
            playOrchestralNote(contextRef.current, note.instrument, midiFromPitch(note.pitch),
              note.length ?? 0.5, 100, volume, note.toPitch ? midiFromPitch(note.toPitch) : null,
              note.duration);
          }
        }
        for (const note of orchestralEventsBetween(score, from, to)) {
          playOrchestralNote(contextRef.current, note.instrument, note.pitch,
            note.duration, note.velocity, volume);
        }
        for (const beat of orbitalPercussionBetween(score, from, to)) {
          playOrbitalPercussion(contextRef.current, beat.type, volume);
        }
      }
      if (time - lastPaintRef.current >= 28) {
        lastPaintRef.current = time;
        setElapsed(to);
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      stopOrchestralVoices(contextRef.current);
    };
  }, [playing, playbackScore, volume]);

  const resetPlayhead = () => {
    elapsedRef.current = 0;
    setElapsed(0);
  };

  const addNote = (ringIndex: number, event: MouseEvent<SVGCircleElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const angle = normalizeDegrees(Math.atan2(point.y - CENTER, point.x - CENTER) * 180 / Math.PI + 90);
    const rounded = normalizeDegrees(Math.round(angle));
    setNotes((current) => current.map((ringNotes, index) => {
      if (index !== ringIndex || ringNotes.some((existing) => angleDistance(existing, rounded) < 3)) return ringNotes;
      return [...ringNotes, rounded].sort((a, b) => a - b);
    }));
  };

  const removeNote = (ringIndex: number, noteIndex: number) => {
    const angle = notes[ringIndex]?.[noteIndex];
    setNotes((current) => current.map((ringNotes, index) =>
      index === ringIndex ? ringNotes.filter((_, position) => position !== noteIndex) : ringNotes));
    setSlides((current) => current.map((ringSlides, index) =>
      index === ringIndex ? ringSlides.filter((slide) => slide.angle !== angle) : ringSlides));
    setNoteLengths((current) => current.map((lengths, index) =>
      index === ringIndex ? lengths.filter((note) => note.angle !== angle) : lengths));
  };

  const shuffleNotes = () => {
    setSlides(RINGS.map(() => []));
    setNoteLengths(RINGS.map(() => []));
    setNotes((current) => current.map((ringNotes) =>
      Array.from({ length: ringNotes.length }, () => Math.floor(Math.random() * 72) * 5)
        .filter((angle, index, all) => all.findIndex((other) => angleDistance(other, angle) < 10) === index)
        .sort((a, b) => a - b)));
  };

  const noteCount = notes.reduce((sum, ring) => sum + ring.length, 0) +
    tracks.reduce((sum, track) => sum + track.notes.length, 0);
  const ringTurn = (ringIndex: number) => orbitalTurnAt(
    elapsed, startDelays[ringIndex], phases[ringIndex],
    ringDurations[ringIndex], ringDirections[ringIndex],
  );

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
                    const lit = turn !== null && angleDistance(headAngle, angle) < 2.5 && playing && !muted[index];
                    const held = noteLengths[index]?.find((note) => note.angle === angle)?.duration;
                    const sweep = held ? Math.min(359, 360 * held / ringDurations[index]) : 0;
                    const end = orbitalPoint(ring.radius, angle + ringDirections[index] * sweep, CENTER);
                    const arc = sweep > 0 ? "M " + point.x + " " + point.y +
                      " A " + ring.radius + " " + ring.radius + " 0 " +
                      (sweep > 180 ? 1 : 0) + " " + (ringDirections[index] === 1 ? 1 : 0) +
                      " " + end.x + " " + end.y : null;
                    return (
                      <g key={index + "-" + angle}>
                        {arc && (
                          <path d={arc} fill="none" stroke={ring.color} strokeWidth="6"
                            strokeLinecap="round" opacity=".76" pointerEvents="none" />
                        )}
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
              {/* Estelas curvadas: una nota sostenida cambia de altura al recorrer un arco. */}
              {RINGS.map((ring, index) => (
                <g key={"slides-" + ring.pitch} pointerEvents="none" opacity={muted[index] ? 0.1 : 1}>
                  {slides[index].map((slide) => {
                    const destination = RINGS.find((item) => item.pitch === slide.toPitch);
                    if (!destination) return null;
                    const sweep = ringDirections[index] * 360 * slide.duration / ringDurations[index];
                    const from = orbitalPoint(ring.radius, slide.angle, CENTER);
                    const middle = orbitalPoint((ring.radius + destination.radius) / 2, slide.angle + sweep / 2, CENTER);
                    const to = orbitalPoint(destination.radius, slide.angle + sweep, CENTER);
                    const d = "M " + from.x + " " + from.y + " Q " + middle.x + " " + middle.y + " " + to.x + " " + to.y;
                    const progress = elapsedSlideProgress(elapsed,
                      { enabled: !muted[index], phase: phases[index], delay: startDelays[index] },
                      { duration: ringDurations[index], direction: ringDirections[index] }, slide);
                    const px = progress === null ? 0 : (1 - progress) ** 2 * from.x +
                      2 * (1 - progress) * progress * middle.x + progress ** 2 * to.x;
                    const py = progress === null ? 0 : (1 - progress) ** 2 * from.y +
                      2 * (1 - progress) * progress * middle.y + progress ** 2 * to.y;
                    return (
                      <g key={slide.angle + "-" + slide.toPitch}>
                        <path d={d} fill="none" stroke={ring.color} strokeOpacity={0.12} strokeWidth={11} />
                        <path d={d} fill="none" stroke={ring.color} strokeOpacity={0.8}
                          strokeWidth={3.2} strokeLinecap="round" strokeDasharray="6 3" />
                        <circle cx={to.x} cy={to.y} r="4" fill={destination.color} />
                        {playing && progress !== null && (
                          <circle cx={px} cy={py} r={11} fill="#fff7bf"
                            stroke={ring.color} strokeWidth={3} filter={"url(#orbital-glow-" + index + ")"}/>
                        )}
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
                <button type="button" onClick={togglePlayback} disabled={loadingSounds}
                  className="flex-1 rounded-xl bg-emerald-300 px-4 py-3 font-semibold text-emerald-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200">
                  {loadingSounds ? "Cargando instrumentos…" : playing ? "⏸ Pausar" : "▶ Reproducir"}
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
              <label className="mt-3 flex items-center gap-2 text-xs text-emerald-100/75">
                <input type="checkbox" checked={percussion === "battle"}
                  onChange={(event) => setPercussion(event.target.checked ? "battle" : "none")}
                  className="accent-amber-300" />
                Percusión marcial (tambor y platillos sintetizados)
              </label>
              <div className="mt-3 flex justify-between text-xs text-emerald-100/60">
                <span>{noteCount} notas</span><span>Tiempo: {elapsed.toFixed(1)} s</span>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Movimiento independiente</h2>
              <p className="mt-2 text-xs leading-5 text-emerald-100/65">
                Cada circunferencia tiene su propia velocidad, sentido, posición y retraso.
                Abre <strong>Ajustar</strong> en la sección de anillos para configurarlas.
                Al variar un movimiento cambiará también cuándo suenan sus notas.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRingDurations(RINGS.map(() => BATTLE_TURN_SECONDS))}
                  className="rounded-lg border border-emerald-200/25 px-2 py-2 text-xs hover:bg-emerald-100/10">
                  Igualar velocidades
                </button>
                <button type="button" onClick={() => setRingDirections((values) =>
                  values.map((value) => value === 1 ? -1 : 1))}
                  className="rounded-lg border border-emerald-200/25 px-2 py-2 text-xs hover:bg-emerald-100/10">
                  Invertir todos los giros
                </button>
              </div>
            </section>

            <OrchestralTracksEditor tracks={tracks} setTracks={setTracks} period={groupDurations[0]} />
          <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Partituras</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                Guarda composiciones aquí o compártelas como archivos JSON.
                Los archivos importados conservan notas, anillos encendidos, fases y tiempos.
              </p>
              <button type="button" onClick={() => {
                loadScore(BATTLE_SCORE);
                setSelectedScore("");
              }}
                className="mt-4 w-full rounded-xl bg-amber-200 px-3 py-3 text-sm font-semibold text-emerald-950 hover:bg-amber-100">
                ⚔️ Ascenso de Xahya · tema épico original
              </button>
              <button type="button" onClick={() => void loadCorona()} disabled={themeBusy}
                className="mt-2 w-full rounded-xl border border-violet-300/50 bg-violet-950/25 px-3 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-950/50 disabled:opacity-40">
                🎻 Corona de Cenizas · orquesta (MIDI multipista)
              </button>
              <button type="button" onClick={() => {
                loadScore(createGoldenScore());
                setSelectedScore("");
              }}
                className="mt-2 w-full rounded-xl border border-emerald-300/50 px-3 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-100/10">
                Cargar melodía proporcionada · 53 notas
              </button>
              <p className="mt-2 text-xs text-emerald-100/60">
                Registro agudo y ritmo uniforme aproximados; la secuencia original no especifica octavas ni duraciones.
              </p>
              <div className="mt-4 rounded-xl border border-amber-200/30 bg-amber-950/20 p-3">
                <h3 className="text-sm font-semibold text-amber-100">Mi tema de combate</h3>
                <p className="mt-1 text-xs leading-5 text-amber-100/70">
                  Cada jugador puede publicar su composición como tema personal de combate.
                  Se guarda en su cuenta y se podrá escuchar desde los encuentros.
                </p>
                <p className="mt-2 text-xs text-amber-100/80">
                  {ownTheme ? "Tema actual: " + ownTheme.title : "Usarás Ascenso de Xahya hasta guardar uno propio."}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void savePersonalTheme()} disabled={themeBusy}
                    className="rounded-lg bg-amber-200 px-2 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50">
                    Guardar como mi tema
                  </button>
                  <button type="button" onClick={() => ownTheme && loadScore(ownTheme)}
                    disabled={!ownTheme || themeBusy}
                    className="rounded-lg border border-amber-200/30 px-2 py-2 text-xs hover:bg-amber-100/10 disabled:opacity-40">
                    Cargar mi tema
                  </button>
                  <button type="button" onClick={() => void resetPersonalTheme()}
                    disabled={!ownTheme || themeBusy}
                    className="col-span-2 rounded-lg border border-amber-200/30 px-2 py-2 text-xs hover:bg-amber-100/10 disabled:opacity-40">
                    Volver al tema predeterminado en mi cuenta
                  </button>
                </div>
              </div>
              <label className="mt-5 block text-xs text-emerald-100/75">
                Nombre de la partitura
                <input type="text" maxLength={120} value={scoreName}
                  onChange={(event) => setScoreName(event.target.value)}
                  placeholder="Mi partitura" className="mt-2 w-full rounded-lg border border-emerald-200/25 bg-[#08251b] px-3 py-2 text-sm text-white" />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <button type="button" onClick={saveScore}
                  className="rounded-lg border border-emerald-300/40 px-3 py-2 font-medium text-emerald-200 hover:bg-emerald-100/10">
                  Guardar aquí
                </button>
                <button type="button" onClick={exportScore}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Exportar JSON
                </button>
              </div>
              <label className="mt-4 block text-xs text-emerald-100/75">
                Importar partitura JSON
                <input type="file" accept=".json,application/json" onChange={importScore}
                  className="mt-2 block w-full cursor-pointer rounded-lg border border-emerald-200/25 bg-[#08251b] p-2 text-xs text-emerald-100 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-200 file:px-3 file:py-2 file:text-xs file:text-emerald-950" />
              </label>
              <label className="mt-4 block text-xs text-emerald-100/75">
                Importar MIDI multipista (.mid)
                <input type="file" accept=".mid,.midi,audio/midi" onChange={(event) => void importMidi(event)}
                  className="mt-2 block w-full cursor-pointer rounded-lg border border-violet-300/25 bg-[#08251b] p-2 text-xs text-emerald-100 file:mr-3 file:rounded-md file:border-0 file:bg-violet-200 file:px-3 file:py-2 file:text-xs file:text-violet-950" />
              </label>
              <p className="mt-2 text-xs text-emerald-100/55">
                Las muestras FluidR3 se descargan solo al reproducir; sin conexión, Xahya usa un sintetizador local.
              </p>
              <label className="mt-4 block text-xs text-emerald-100/75">
                Partituras guardadas ({savedScores.length})
                <select value={selectedScore} onChange={(event) => setSelectedScore(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-emerald-200/25 bg-[#08251b] px-3 py-2 text-sm text-white">
                  <option value="">Seleccionar partitura…</option>
                  {savedScores.map((score) => <option key={score.title} value={score.title}>{score.title}</option>)}
                </select>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <button type="button" disabled={!selectedScore}
                  onClick={() => {
                    const score = savedScores.find((entry) => entry.title === selectedScore);
                    if (score) loadScore(score);
                  }}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 enabled:hover:bg-emerald-100/10 disabled:opacity-35">
                  Cargar
                </button>
                <button type="button" disabled={!selectedScore} onClick={removeSavedScore}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 enabled:hover:bg-emerald-100/10 disabled:opacity-35">
                  Borrar guardada
                </button>
              </div>
              {scoreMessage && <p role="status" className="mt-3 text-xs leading-5 text-emerald-200">{scoreMessage}</p>}
              <p className="mt-3 text-xs text-emerald-100/50">
                Guardar aquí conserva las partituras en este navegador, no en tu cuenta.
                Usa Exportar para respaldarlas o llevarlas a otro dispositivo.
              </p>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Notas que se deslizan</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                Una nota puede prolongarse y subir o bajar de altura en lugar de sonar
                como un punto. En el gráfico aparecerá como una estela curva luminosa.
              </p>
              <div className="mt-3 space-y-3">
                <label className="block text-xs text-emerald-100/75">
                  Circunferencia de origen
                  <select value={slideRing} onChange={(event) => {
                    setSlideRing(event.target.value);
                    if (slideTarget === event.target.value) {
                      setSlideTarget(RINGS.find((item) => item.pitch !== event.target.value)?.pitch ?? "");
                    }
                    const index = RINGS.findIndex((item) => item.pitch === event.target.value);
                    setSlideAngle(String(notes[index]?.[0] ?? ""));
                  }}
                    className="mt-1 w-full rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-2 text-sm text-white">
                    {RINGS.map((ring) => <option key={ring.pitch} value={ring.pitch}>{ring.note}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-emerald-100/75">
                  Nota que se desliza (posición angular)
                  <select value={chosenAngle ?? ""} onChange={(event) => setSlideAngle(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-2 text-sm text-white">
                    {slideOptions.length === 0 ? <option value="">Sin notas: añade una en el gráfico</option> :
                      slideOptions.map((angle) => <option key={angle} value={angle}>{angle.toFixed(2)}°</option>)}
                  </select>
                </label>
                <label className="block text-xs text-emerald-100/75">
                  Tono al terminar
                  <select value={slideTarget} onChange={(event) => setSlideTarget(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-2 text-sm text-white">
                    {RINGS.filter((ring) => ring.pitch !== slideRing).map((ring) =>
                      <option key={ring.pitch} value={ring.pitch}>{ring.note}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-emerald-100/75">
                  <span className="flex justify-between"><span>Duración del deslizamiento</span><span>{slideDuration.toFixed(1)} s</span></span>
                  <input type="range" min="0.1" max="3" step="0.05" value={slideDuration}
                    onChange={(event) => setSlideDuration(Number(event.target.value))}
                    className="mt-2 w-full accent-emerald-300"/>
                </label>
                <button type="button" onClick={upsertSlide} disabled={chosenAngle === undefined}
                  className="w-full rounded-lg bg-cyan-200 px-3 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-100 disabled:opacity-40">
                  Crear o actualizar deslizamiento
                </button>
              </div>
              <p className="mt-4 text-xs text-emerald-100/65">Deslizamientos en esta partitura: {allSlides.length}</p>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {allSlides.map((slide) => (
                  <div key={slide.index + "-" + slide.angle}
                    className="flex items-center justify-between gap-2 rounded-md border border-emerald-100/10 px-2 py-1.5 text-xs">
                    <span>{slide.source} → {RINGS.find((ring) => ring.pitch === slide.toPitch)?.note ?? slide.toPitch}
                      {" · "}{slide.angle.toFixed(1)}° · {slide.duration} s</span>
                    <button type="button" onClick={() => removeSlide(slide.index, slide.angle)}
                      className="rounded border border-emerald-200/20 px-2 py-1 hover:bg-emerald-100/10"
                      aria-label={"Eliminar deslizamiento desde " + slide.source}>Quitar</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200/15 bg-black/25 p-5">
              <h2 className="text-lg font-semibold">Anillos e inicio</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-100/65">
                Cada circunferencia tiene su propia velocidad, dirección, posición y retraso.
                Desmarcarla apaga su sonido sin borrar las notas.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button type="button" onClick={() => setMuted(RINGS.map(() => false))}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Encender todas
                </button>
                <button type="button" onClick={() => setMuted(RINGS.map(() => true))}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Apagar todas
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {RINGS.map((ring, index) => (
                  <div key={"settings-" + ring.note} className="rounded-lg border border-emerald-100/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={!muted[index]}
                          onChange={(event) => setMuted((current) =>
                            current.map((value, i) => i === index ? !event.target.checked : value))}
                          className="accent-emerald-300" aria-label={"Encender circunferencia " + ring.note} />
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ring.color }} />
                        {ring.note}
                        <span className="text-xs font-normal text-emerald-100/50">({notes[index].length})</span>
                        <span className="text-[11px] font-normal text-emerald-200/60">
                          {ringDurations[index]}s {ringDirections[index] === 1 ? "↻" : "↺"}
                        </span>
                      </label>
                      <button type="button" aria-expanded={expandedRing === index}
                        aria-label={"Configurar circunferencia " + ring.note}
                        onClick={() => setExpandedRing((current) => current === index ? null : index)}
                        className="rounded-md border border-emerald-200/15 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-100/10">
                        {expandedRing === index ? "Cerrar" : "Ajustar"}
                      </button>
                    </div>
                    {expandedRing === index && (
                      <div className="mt-3 border-t border-emerald-100/10 pt-2">
                        <label className="mb-3 flex items-center justify-between gap-2 text-xs text-emerald-100/65">
                          Instrumento
                          <select value={ringInstruments[index]} aria-label={"Instrumento de " + ring.note}
                            onChange={(event) => setRingInstruments((current) => current.map((value, i) =>
                              i === index ? event.target.value as OrbitalInstrument : value))}
                            className="max-w-44 rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-2 text-emerald-50">
                            {RING_INSTRUMENTS.map((instrument) =>
                              <option key={instrument} value={instrument}>{INSTRUMENT_LABELS[instrument]}</option>)}
                          </select>
                        </label>
                        {notes[index].length > 0 && (
                          <details className="mb-3 rounded-lg border border-emerald-200/15 p-2">
                            <summary className="cursor-pointer text-xs text-emerald-100/75">
                              Duración individual de notas ({notes[index].length})
                            </summary>
                            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                              {notes[index].map((angle) => {
                                const length = noteLengths[index]?.find((item) => item.angle === angle)?.duration;
                                return (
                                  <label key={angle} className="flex items-center justify-between gap-2 text-xs text-emerald-100/70">
                                    <span>{angle.toFixed(1)}°</span>
                                    <input type="number" min=".05" max="30" step=".05"
                                      value={length ?? ""} placeholder="Breve"
                                      aria-label={"Duración de " + ring.note + " en " + angle + " grados"}
                                      onChange={(event) => {
                                        const next = Number(event.target.value);
                                        const clear = event.target.value === "" || !Number.isFinite(next);
                                        setNoteLengths((current) => current.map((entries, i) => {
                                          if (i !== index) return entries;
                                          const remaining = entries.filter((item) => item.angle !== angle);
                                          return clear ? remaining
                                            : [...remaining, { angle, duration: Math.max(.05, Math.min(30, next)) }];
                                        }));
                                      }}
                                      className="w-24 rounded border border-emerald-300/25 bg-[#09271c] p-1.5 text-right text-emerald-50" />
                                    <span>segundos</span>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        )}
                        <label className="block text-xs text-emerald-100/65">
                          <span className="flex justify-between"><span>Duración de una vuelta (velocidad)</span><span>{ringDurations[index]} s</span></span>
                          <input type="range" min="2" max="30" step="0.5" value={ringDurations[index]}
                            onChange={(event) => setRingDurations((current) =>
                              current.map((value, i) => i === index ? Number(event.target.value) : value))}
                            aria-label={"Duración de vuelta de " + ring.note}
                            className="mt-2 w-full accent-emerald-300" />
                        </label>
                        <label className="mt-3 flex items-center justify-between gap-3 text-xs text-emerald-100/65">
                          <span>Sentido de giro</span>
                          <select value={ringDirections[index]}
                            onChange={(event) => setRingDirections((current) =>
                              current.map((value, i) => i === index ? Number(event.target.value) as 1 | -1 : value))}
                            aria-label={"Sentido de giro de " + ring.note}
                            className="rounded-lg border border-emerald-300/30 bg-[#09271c] px-2 py-2 text-emerald-50">
                            <option value={1}>Horario ↻</option>
                            <option value={-1}>Antihorario ↺</option>
                          </select>
                        </label>
                        <label className="mt-3 block text-xs text-emerald-100/65">
                          <span className="flex justify-between"><span>Posición inicial</span><span>{phases[index]}°</span></span>
                          <input type="range" min="0" max="359" step="1" value={phases[index]}
                            onChange={(event) => setPhases((current) =>
                              current.map((value, i) => i === index ? Number(event.target.value) : value))}
                            aria-label={"Posición inicial del anillo " + ring.note}
                            className="mt-2 w-full accent-emerald-300" />
                        </label>
                        <label className="mt-3 block text-xs text-emerald-100/65">
                          <span className="flex justify-between gap-2">
                            <span>Comenzar tras</span>
                            <span className="font-mono text-emerald-300">{startDelays[index]} s</span>
                          </span>
                          <input type="range" min="0" max="30" step="0.5" value={startDelays[index]}
                            onChange={(event) => setStartDelays((current) =>
                              current.map((value, i) => i === index ? Number(event.target.value) : value))}
                            aria-label={"Retraso de inicio del anillo " + ring.note}
                            className="mt-2 w-full accent-emerald-300" />
                        </label>
                      </div>
                    )}
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
                <button type="button" onClick={() => loadScore(BATTLE_SCORE)}
                  className="rounded-lg border border-emerald-200/25 px-3 py-2 hover:bg-emerald-100/10">
                  Tema épico
                </button>
                <button type="button" onClick={() => { setNotes(RINGS.map(() => [])); setSlides(RINGS.map(() => [])); }}
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
