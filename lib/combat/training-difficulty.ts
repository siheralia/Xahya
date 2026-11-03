/** Encounter-only training difficulty. Never alters player damage or persistent stats. */
export const TRAINING_DIFFICULTIES = {
  BASIC: {baseMultiplier:0.75, hpMultiplier:1, defenseMultiplier:1},
  INTERMEDIATE: {baseMultiplier:1, hpMultiplier:1, defenseMultiplier:1},
  ADVANCED: {baseMultiplier:1.2, hpMultiplier:2, defenseMultiplier:1.25},
  ENDURANCE: {baseMultiplier:1, hpMultiplier:20, defenseMultiplier:1.5},
} as const;
export type TrainingDifficulty = keyof typeof TRAINING_DIFFICULTIES;
export function parseTrainingDifficulty(value:unknown):TrainingDifficulty {
  if(value===undefined||value===null||value==="")return "INTERMEDIATE";
  if(typeof value==="string" && Object.hasOwn(TRAINING_DIFFICULTIES,value))return value as TrainingDifficulty;
  throw new Error("Dificultad de entrenamiento inválida.");
}
export function trainingBaseStats<T extends Record<string,number>>(base:T,difficulty:TrainingDifficulty,preserveStat="agility"):T {
 const profile=TRAINING_DIFFICULTIES[difficulty];
 return Object.fromEntries(Object.entries(base).map(([key,value])=>[key,
  key===preserveStat?value:Math.max(1,Math.round(value*profile.baseMultiplier))
 ])) as T;
}
export function applyTrainingDifficulty<T extends {hp:number;maxHp:number;physicalDefense:number;magicDefense:number}>(
 fighter:T,difficulty:TrainingDifficulty):T {
 const profile=TRAINING_DIFFICULTIES[difficulty];
 const maxHp=Math.max(1,Math.round(fighter.maxHp*profile.hpMultiplier));
 return {...fighter,maxHp,hp:maxHp,
  physicalDefense:Math.max(0,fighter.physicalDefense*profile.defenseMultiplier),
  magicDefense:Math.max(0,fighter.magicDefense*profile.defenseMultiplier)};
}
