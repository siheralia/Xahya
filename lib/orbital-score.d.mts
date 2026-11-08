export interface OrbitalSlide {
  angle: number;
  toPitch: string;
  duration: number;
}
export const SCORE_FORMAT: "xahya-orbital-score";
export const SCORE_VERSION: 1;
export const RING_PITCHES: readonly string[];
export const GOLDEN_PHRASES: readonly (readonly string[])[];
export interface OrbitalScoreRing {
  pitch: string;
  enabled: boolean;
  phase: number;
  delay: number;
  duration: number;
  direction: 1 | -1;
  instrument: "synth" | "strings" | "bass";
  angles: number[];
  slides: OrbitalSlide[];
}
export interface OrbitalScore {
  format: "xahya-orbital-score";
  version: 1;
  title: string;
  percussion: "none" | "battle" | "orchestral";
  groups: [{ duration: number; direction: 1 | -1 }, { duration: number; direction: 1 | -1 }];
  rings: OrbitalScoreRing[];
}
export function parseOrbitalScore(value: unknown): OrbitalScore;
export function createGoldenScore(): OrbitalScore;
