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


export type MazeGenerationMode = "FREE_3D" | "PLANAR_2D" | "LINEAR" | "SPIRAL_TOWER";

export function pickRandomDirections(count = 2, mode: MazeGenerationMode = "FREE_3D", roomNumber = 1) {
  if (mode === "PLANAR_2D") {
    return [...(["N","E","S","O"] as const)].sort(() => Math.random() - 0.5).slice(0, Math.max(2, Math.min(4, count)));
  }
  if (mode === "LINEAR") return ["E"];
  if (mode === "SPIRAL_TOWER") {
    const spiral = ["E","N","O","S","UP"] as const;
    return [spiral[(Math.max(1, roomNumber) - 1) % spiral.length]];
  }
  return [...MAZE_DIRECTIONS].sort(() => Math.random() - 0.5).slice(0, Math.max(2, Math.min(4, count)));
}

export function pickRoomType(luck = 0) {
  const normalizedLuck = Math.max(0, Number(luck) || 0);
  // La Suerte desplaza parte del peso de TRAP hacia TREASURE y BOSS.
  // Cada 100 puntos de LCK reduce TRAP hasta un 75% de su peso.
  const trapReduction = Math.min(0.75, normalizedLuck * 0.01);
  const trapWeight = 20 * (1 - trapReduction);
  const removedTrapWeight = 20 - trapWeight;
  const treasureBonus = removedTrapWeight * (2 / 3);
  const bossBonus = removedTrapWeight * (1 / 3);

  const weights = ROOM_WEIGHTS.map((entry) => {
    if (entry.type === "TRAP") return { ...entry, weight: trapWeight };
    if (entry.type === "TREASURE") return { ...entry, weight: entry.weight + treasureBonus };
    if (entry.type === "BOSS") return { ...entry, weight: entry.weight + bossBonus };
    return entry;
  });

  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = Math.random() * total;
  let cursor = 0;
  for (const entry of weights) {
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


export const ENEMY_FOCUSES = [
  "PHYSICAL","DEFENSIVE","MAGICAL","CONTROL","SPEED","PRECISION","BALANCED",
] as const;

export const ENEMY_BEHAVIORS = [
  "AGGRESSIVE","HUNTER","AMBUSHER","DEFENSIVE","ROAMER","GUARDIAN","CONTROLLER",
] as const;

export type EnemyFocus = (typeof ENEMY_FOCUSES)[number];
export type EnemyBehavior = (typeof ENEMY_BEHAVIORS)[number];

const STAT_KEYS = ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK"] as const;
type EnemyStats = Record<(typeof STAT_KEYS)[number], number>;

const FOCUS_WEIGHTS: Record<EnemyFocus, EnemyStats> = {
  PHYSICAL:{STR:.30,AGI:.25,CON:.15,INT:.05,WIS:.05,CHA:.05,SPI:.05,LCK:.10},
  DEFENSIVE:{STR:.10,AGI:.10,CON:.40,INT:.05,WIS:.15,CHA:.05,SPI:.10,LCK:.05},
  MAGICAL:{STR:.05,AGI:.05,CON:.05,INT:.35,WIS:.15,CHA:.05,SPI:.30,LCK:.05},
  CONTROL:{STR:.05,AGI:.05,CON:.05,INT:.25,WIS:.30,CHA:.10,SPI:.20,LCK:0},
  SPEED:{STR:.15,AGI:.40,CON:.05,INT:.05,WIS:.05,CHA:.05,SPI:.05,LCK:.20},
  PRECISION:{STR:.05,AGI:.30,CON:.05,INT:.10,WIS:.10,CHA:.05,SPI:.05,LCK:.30},
  BALANCED:{STR:.125,AGI:.125,CON:.125,INT:.125,WIS:.125,CHA:.125,SPI:.125,LCK:.125},
};

export function depthMultiplier(roomNumber: number) {
  if (roomNumber <= 5) return 1;
  if (roomNumber <= 10) return 1.2;
  if (roomNumber <= 20) return 1.4;
  if (roomNumber <= 30) return 1.6;
  if (roomNumber <= 40) return 1.8;
  return 2 + Math.floor((roomNumber - 41) / 10) * 0.2;
}

export function pickEnemyFocus(isBoss = false): EnemyFocus {
  const pool: EnemyFocus[] = isBoss
    ? ["PHYSICAL","DEFENSIVE","MAGICAL","CONTROL","BALANCED"]
    : [...ENEMY_FOCUSES];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickEnemyBehavior(isBoss = false): EnemyBehavior {
  const pool: EnemyBehavior[] = isBoss
    ? ["AGGRESSIVE","DEFENSIVE","GUARDIAN","CONTROLLER"]
    : [...ENEMY_BEHAVIORS];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function scaleEnemyStats(
  template: Partial<EnemyStats>,
  groupPower: number,
  roomNumber: number,
  focus: EnemyFocus,
) {
  const base: EnemyStats = Object.fromEntries(
    STAT_KEYS.map((key) => [key, Math.max(0, Number(template[key] ?? 0))]),
  ) as EnemyStats;
  const baseTotal = STAT_KEYS.reduce((sum,key) => sum + base[key], 0);
  const targetPower = Math.max(1, Math.round(groupPower * 1.6 * depthMultiplier(roomNumber)));
  const focusWeights = FOCUS_WEIGHTS[focus];
  const blended: EnemyStats = Object.fromEntries(
    STAT_KEYS.map((key) => [key, baseTotal > 0 ? base[key] * .6 + baseTotal * focusWeights[key] * .4 : baseTotal * focusWeights[key]]),
  ) as EnemyStats;
  const blendedTotal = STAT_KEYS.reduce((sum,key) => sum + blended[key], 0) || 1;
  return {
    targetPower,
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, Math.max(0, Math.round(blended[key] * targetPower / blendedTotal))])),
  };
}
