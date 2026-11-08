import type { OrbitalScore } from "./orbital-score.mjs";
export interface OrbitalAudioEvent { pitch: string; angle: number; instrument: "synth" | "strings" | "bass" | "pulse"; toPitch: string | null; duration: number | null }
export function orbitalEventsBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrbitalAudioEvent[];
export interface OrbitalDrumEvent { type: "kick" | "snare" | "hat" | "timpani" | "cymbal"; time: number }
export function orbitalPercussionBetween(score: OrbitalScore, fromSeconds: number, toSeconds: number): OrbitalDrumEvent[];
export function playOrbitalPercussion(context: AudioContext, type: OrbitalDrumEvent["type"], volume: number): void;
export function orbitalVoicePlan(frequency: number, glideToHz?: number | null, glideSeconds?: number | null, instrument?: "synth" | "strings" | "bass" | "pulse"): {
  bass: boolean;
  strings: boolean;
  deepBass: boolean;
  pulse: boolean;
  gliding: boolean;
  hold: number;
  bend: number;
  release: number;
  cutoff: number;
};
export function playOrbitalSound(context: AudioContext, frequency: number, volume: number, glideToHz?: number | null, glideSeconds?: number | null, instrument?: "synth" | "strings" | "bass" | "pulse"): void;
export function elapsedSlideProgress(elapsedSeconds: number, ring: Pick<OrbitalScore["rings"][number], "enabled" | "phase" | "delay"> & { instrument?: "synth" | "strings" | "bass" | "pulse" }, group: OrbitalScore["groups"][number], slide: OrbitalScore["rings"][number]["slides"][number]): number | null;
