import type { OrbitalScore } from "./orbital-score.mjs";
export interface OrbitalAudioEvent { pitch: string; angle: number; toPitch: string | null; duration: number | null }
export function orbitalEventsBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrbitalAudioEvent[];
export function orbitalVoicePlan(frequency: number, glideToHz?: number | null, glideSeconds?: number | null): {
  bass: boolean;
  gliding: boolean;
  hold: number;
  bend: number;
  release: number;
  cutoff: number;
};
export function playOrbitalSound(context: AudioContext, frequency: number, volume: number, glideToHz?: number | null, glideSeconds?: number | null): void;
export function elapsedSlideProgress(elapsedSeconds: number, ring: Pick<OrbitalScore["rings"][number], "enabled" | "phase" | "delay">, group: OrbitalScore["groups"][number], slide: OrbitalScore["rings"][number]["slides"][number]): number | null;
