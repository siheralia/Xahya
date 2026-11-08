"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, Volume2 } from "lucide-react";
import { createBattleThemeScore, pitchFrequency } from "@/lib/orbital-theme.mjs";
import { parseOrbitalScore } from "@/lib/orbital-score.mjs";
import type { OrbitalScore } from "@/lib/orbital-score.mjs";
import { orbitalEventsBetween, orbitalPercussionBetween, playOrbitalSound, playOrbitalPercussion } from "@/lib/orbital-playback.mjs";
import { midiFromPitch, orchestralEventsBetween, playOrchestralNote, prepareOrchestralInstruments, stopOrchestralVoices } from "@/lib/orbital-orchestra.mjs";
import { loadCoronaDefault } from "@/lib/orbital-instrument-rings.mjs";
import { CRITICAL_TEMPO_MULTIPLIER, easeCombatTempo } from "@/lib/combat/music-tempo.mjs";

const EPIC_THEME = createBattleThemeScore();

/** Optional combat soundtrack: never consumes PA, ticks, mana, or server calls per note. */
export default function CombatMusicPlayer({
  active, criticalHealth = false,
}: { active: boolean; criticalHealth?: boolean }) {
  const [personal, setPersonal] = useState<OrbitalScore | null>(null);
  const [corona, setCorona] = useState<OrbitalScore | null>(null);
  const [defaultBusy, setDefaultBusy] = useState(true);
  const [selection, setSelection] = useState<"default" | "personal">("default");
  const [playing, setPlaying] = useState(false);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [volume, setVolume] = useState(38);
  const [message, setMessage] = useState("");
  const clockRef = useRef(0);
  const tempoRef = useRef(1);
  const tempoTargetRef = useRef(1);
  const audioRef = useRef<AudioContext | null>(null);
  const score = selection === "personal" && personal ? personal : corona ?? EPIC_THEME;

  // Update the target from combat HP without restarting the audio loop, even
  // while currently sustained samples are still playing.
  useEffect(() => {
    tempoTargetRef.current = active && criticalHealth ? CRITICAL_TEMPO_MULTIPLIER : 1;
  }, [active, criticalHealth]);

  useEffect(() => {
    let alive = true;
    loadCoronaDefault().then((score) => {
      if (alive) { setCorona(score); setDefaultBusy(false); }
    }).catch(() => {
      if (alive) {
        setDefaultBusy(false);
        setMessage("No se pudo cargar Corona de Cenizas; se usará temporalmente Ascenso de Xahya.");
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/music-theme", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sincronización musical no disponible");
        return response.json();
      })
      .then((data) => {
        if (!alive || !data.theme) return;
        const parsed = parseOrbitalScore(data.theme);
        setPersonal(parsed);
        setSelection("personal");
      })
      .catch(() => {
        if (alive) setMessage("Tema predeterminado disponible; no se pudo consultar el tema personal.");
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (active) return;
    // End of encounter: never continue soundtrack into the next screen.
    setPlaying(false);
  }, [active]);

  useEffect(() => {
    return () => {
      stopOrchestralVoices(audioRef.current);
      if (audioRef.current) void audioRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!playing || !active) return;
    let frame = 0;
    let before: number | null = null;
    const step = (now: number) => {
      const delta = before === null ? 0 : Math.min(0.15, Math.max(0, (now - before) / 1000));
      before = now;
      tempoRef.current = easeCombatTempo(tempoRef.current, tempoTargetRef.current, delta);
      const tempo = tempoRef.current;
      const start = clockRef.current;
      clockRef.current += delta * tempo;
      if (delta > 0 && audioRef.current) {
        for (const note of orbitalEventsBetween(score, start, clockRef.current)) {
          if (note.instrument === "synth") {
            playOrbitalSound(audioRef.current, pitchFrequency(note.pitch), volume,
              note.toPitch ? pitchFrequency(note.toPitch) : null,
              note.duration == null ? null : note.duration / tempo,
              note.length == null ? null : note.length / tempo);
          } else {
            playOrchestralNote(audioRef.current, note.instrument, midiFromPitch(note.pitch),
              (note.length ?? 0.5) / tempo, 100, volume,
              note.toPitch ? midiFromPitch(note.toPitch) : null,
              note.duration == null ? null : note.duration / tempo);
          }
        }
        for (const note of orchestralEventsBetween(score, start, clockRef.current)) {
          playOrchestralNote(audioRef.current, note.instrument,
            note.pitch, note.duration / tempo, note.velocity, volume);
        }
        for (const beat of orbitalPercussionBetween(score, start, clockRef.current)) {
          playOrbitalPercussion(audioRef.current, beat.type, volume);
        }
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      stopOrchestralVoices(audioRef.current);
    };
  }, [playing, active, score, volume]);

  async function toggle() {
    if (playing) { setPlaying(false); return; }
    if (loadingSounds || (selection === "default" && defaultBusy)) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      await audioRef.current.resume();
      setLoadingSounds(true);
      const loading = await prepareOrchestralInstruments(audioRef.current, score);
      await audioRef.current.resume();
      setMessage(loading.fallback ? "Algunos instrumentos usarán síntesis local." : "");
      setPlaying(true);
    } catch {
      setMessage("Toca de nuevo para activar el audio de este navegador.");
    } finally {
      setLoadingSounds(false);
    }
  }

  return (
    <section aria-label="Música de combate"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-950/20 px-3 py-2 text-xs text-violet-100">
      <Music2 size={18} aria-hidden="true" className="text-violet-300"/>
      <span className="font-semibold">Música</span>
      {active && criticalHealth && (
        <span role="status" className="rounded-md border border-rose-300/45 bg-rose-950/35 px-2 py-1 font-semibold text-rose-100">
          <span aria-hidden="true">⚡ </span>Fase crítica · ×{CRITICAL_TEMPO_MULTIPLIER.toFixed(1)}
        </span>
      )}
      <select aria-label="Tema de combate" value={selection}
        onChange={(event) => {
          setPlaying(false);
          clockRef.current = 0;
          setSelection(event.target.value as "default" | "personal");
        }}
        className="max-w-[170px] flex-1 rounded-md border border-violet-400/30 bg-zinc-950 px-2 py-2 text-xs">
        <option value="default">Corona de Cenizas</option>
        {personal && <option value="personal">Mi tema: {personal.title}</option>}
      </select>
      <button type="button" onClick={toggle} disabled={!active || loadingSounds || (selection === "default" && defaultBusy)}
        aria-label={playing ? "Pausar música" : "Reproducir música"}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-violet-400/40 px-3 py-2 hover:bg-violet-500/15 disabled:opacity-40">
        {playing ? <Pause size={16}/> : <Play size={16}/>}
        {defaultBusy && selection === "default" ? "Cargando Corona…" : loadingSounds ? "Cargando…" : playing ? "Pausar" : "Sonar"}
      </button>
      <label className="flex items-center gap-1">
        <Volume2 size={14} aria-hidden="true"/>
        <input type="range" min="0" max="100" step="1" value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Volumen de música en combate" className="w-16 accent-violet-300"/>
      </label>
      {message && <span role="status" className="w-full text-xs text-amber-200">{message}</span>}
    </section>
  );
}
