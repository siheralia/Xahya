import type { OrbitalScore, OrchestralInstrument } from "./orbital-score.mjs";
export function midiFromPitch(pitch: number | string): number;
export function pitchFromMidi(pitch: number): string;
export interface OrchestralAudioEvent {
  trackIndex: number;
  instrument: OrchestralInstrument;
  pitch: number;
  duration: number;
  velocity: number;
  time: number;
}
export function orchestralEventsBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrchestralAudioEvent[];
export function prepareOrchestralInstruments(context: AudioContext, score: OrbitalScore): Promise<{ sampled: number; fallback: number }>;
export function playOrchestralNote(context: AudioContext, instrument: OrchestralInstrument,
  pitch: number, duration: number, velocity: number, volume: number,
  toPitch?: number | null, glideSeconds?: number | null): void;
export function stopOrchestralVoices(context: AudioContext | null): void;
