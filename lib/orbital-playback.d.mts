import type { OrbitalScore } from "./orbital-score.mjs";
export interface OrbitalAudioEvent {
  pitch: string;
  angle: number;
  instrument: import("./orbital-score.mjs").OrbitalInstrument;
  length: number | null;
  toPitch: string | null;
  duration: number | null;
}
export function orbitalEventsBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrbitalAudioEvent[];
export interface OrbitalDrumEvent { type: "kick" | "snare" | "hat"; time: number }
export function orbitalPercussionBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrbitalDrumEvent[];
export function playOrbitalPercussion(context: AudioContext, type: OrbitalDrumEvent["type"], volume: number): void;
export function orbitalVoicePlan(frequency: number, glideToHz?: number | null, glideSeconds?: number | null, noteLength?: number | null): {
  bass: boolean;
  gliding: boolean;
  hold: number;
  bend: number;
  release: number;
  cutoff: number;
};
export function playOrbitalSound(context: AudioContext, frequency: number, volume: number, glideToHz?: number | null, glideSeconds?: number | null, noteLength?: number | null): void;
export function elapsedSlideProgress(elapsedSeconds: number, ring: Pick<OrbitalScore["rings"][number], "enabled" | "phase" | "delay"> & Partial<Pick<OrbitalScore["rings"][number], "noteLengths">>, group: OrbitalScore["groups"][number], slide: OrbitalScore["rings"][number]["slides"][number]): number | null;
