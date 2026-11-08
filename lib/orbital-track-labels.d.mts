import type { OrchestralTrack } from "./orbital-score.mjs";
export const ORBIT_INSTRUMENT_NAMES: Readonly<Record<OrchestralTrack["instrument"], string>>;
export const ORBIT_INSTRUMENT_SHORT_NAMES: Readonly<Record<OrchestralTrack["instrument"], string>>;
export function orbitTrackRole(track: Pick<OrchestralTrack, "instrument" | "name">): string;
export function orbitTrackLabel(track: Pick<OrchestralTrack, "instrument" | "name">): string;
