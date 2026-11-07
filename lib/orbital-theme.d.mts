import type { OrbitalScore } from "./orbital-score.mjs";
export function createBattleThemeScore(): OrbitalScore;
export function pitchFrequency(pitch: string): number;
export function slideProgress(elapsed: number, ring: OrbitalScore["rings"][number], group: OrbitalScore["groups"][number], slide: OrbitalScore["rings"][number]["slides"][number]): number | null;
