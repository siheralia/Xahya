export const MAZE_DIRECTIONS = [
  "N","E","S","O",
  "N_UP","E_UP","S_UP","O_UP",
  "N_DOWN","E_DOWN","S_DOWN","O_DOWN",
  "UP","DOWN",
] as const;

export type MazeDirection = (typeof MAZE_DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<MazeDirection, string> = {
  N:"Norte", E:"Este", S:"Sur", O:"Oeste",
  N_UP:"Norte ↑", E_UP:"Este ↑", S_UP:"Sur ↑", O_UP:"Oeste ↑",
  N_DOWN:"Norte ↓", E_DOWN:"Este ↓", S_DOWN:"Sur ↓", O_DOWN:"Oeste ↓",
  UP:"Arriba", DOWN:"Abajo",
};

export const OPPOSITE_DIRECTION: Record<MazeDirection, MazeDirection> = {
  N:"S", E:"O", S:"N", O:"E",
  N_UP:"S_DOWN", E_UP:"O_DOWN", S_UP:"N_DOWN", O_UP:"E_DOWN",
  N_DOWN:"S_UP", E_DOWN:"O_UP", S_DOWN:"N_UP", O_DOWN:"E_UP",
  UP:"DOWN", DOWN:"UP",
};

export const ROOM_WEIGHTS = [
  { type:"ENEMY", weight:30 },
  { type:"TRAP", weight:20 },
  { type:"BOSS", weight:10 },
  { type:"TREASURE", weight:10 },
  { type:"SAFE", weight:5 },
  { type:"DEATH", weight:1 },
  { type:"MOBILE_ENEMY", weight:19 },
  { type:"NPC", weight:5 },
] as const;

export function pickRandomDirections(count = 2) {
  return [...MAZE_DIRECTIONS].sort(() => Math.random() - 0.5).slice(0, Math.max(2, Math.min(4, count)));
}

export function pickRoomType() {
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const entry of ROOM_WEIGHTS) {
    cursor += entry.weight;
    if (roll < cursor) return entry.type;
  }
  return "ENEMY";
}

export function pickWeighted<T extends { encounterWeight: number }>(items: T[]) {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(1, Number(item.encounterWeight)), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(1, Number(item.encounterWeight));
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}
