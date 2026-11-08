export interface OrbitalSlide {
  angle: number;
  toPitch: string;
  duration: number;
}
export const SCORE_FORMAT: "xahya-orbital-score";
export const SCORE_VERSION: 1;
export const RING_PITCHES: readonly string[];
export type OrbitalInstrument = "synth" | "violin" | "string_ensemble_1" |
  "french_horn" | "cello" | "acoustic_bass" | "distortion_guitar" |
  "choir_aahs" | "tremolo_strings" | "timpani" | "brass_section" | "drumkit";
export type OrchestralInstrument = Exclude<OrbitalInstrument, "synth">;
export const ORCHESTRAL_INSTRUMENTS: readonly OrchestralInstrument[];
export const RING_INSTRUMENTS: readonly OrbitalInstrument[];
export interface OrbitalNoteLength { angle: number; duration: number }
export interface OrchestralNote { pitch: number; start: number; duration: number; velocity: number }
export interface InstrumentOrbit {
  duration: number;
  direction: 1 | -1;
  phase: number;
  enabled: boolean;
}
export interface OrchestralTrack {
  name: string;
  instrument: OrchestralInstrument;
  orbit: InstrumentOrbit;
  notes: OrchestralNote[];
}
export const GOLDEN_PHRASES: readonly (readonly string[])[];
export interface OrbitalScoreRing {
  pitch: string;
  enabled: boolean;
  phase: number;
  delay: number;
  duration: number;
  direction: 1 | -1;
  instrument: OrbitalInstrument;
  angles: number[];
  noteLengths: OrbitalNoteLength[];
  slides: OrbitalSlide[];
}
export interface OrbitalScore {
  format: "xahya-orbital-score";
  version: 1;
  title: string;
  percussion: "none" | "battle";
  groups: [{ duration: number; direction: 1 | -1 }, { duration: number; direction: 1 | -1 }];
  rings: OrbitalScoreRing[];
  tracks: OrchestralTrack[];
}
export function parseOrbitalScore(value: unknown): OrbitalScore;
export function createGoldenScore(): OrbitalScore;
