import type { OrbitalScore, OrchestralTrack, InstrumentOrbit } from "./orbital-score.mjs";
export const CORONA_TITLE: string;
export const CORONA_ASSET: string;
export function normalizeOrbitAngle(angle: number): number;
export function orbitPositionForNote(note: { start: number }, orbit: InstrumentOrbit): { lap: number; angle: number };
export function orbitTimeForAngle(angle: number, orbit: InstrumentOrbit, lap?: number): number;
export function moveInstrumentOrbit(track: OrchestralTrack, motion: InstrumentOrbit, masterDuration: number): OrchestralTrack | null;
export function orchestrateInstrumentOrbits(score: OrbitalScore): OrbitalScore;
export function loadCoronaDefault(fetcher?: typeof fetch): Promise<OrbitalScore>;
