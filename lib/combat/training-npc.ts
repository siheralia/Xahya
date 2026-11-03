/**
 * Training NPCs are comparable to the challenger's base statistics, not exact
 * clones. Vary the non-speed attributes by at most ±8% on each encounter.
 * AGI is deliberately mirrored so equal-speed sparring keeps exercising the
 * alternating-initiative mechanic. A GM may explicitly override the base stats.
 * Caller supplies server-only randomness; never generate stats in the client.
 */
export const NPC_STAT_VARIANCE = 0.08;
export const TRAINING_NPC_ATTRIBUTES = [
 "strength","constitution","intelligence","wisdom","charisma","spirit","luck",
] as const;
type BaseStats = Record<string,number>;
export function varyTrainingNpcStats<T extends BaseStats>(base:T,random:()=>number,preserveStat="agility"):T {
 const varied:BaseStats={...base};
 for(const key of TRAINING_NPC_ATTRIBUTES) {
  if(key===preserveStat)continue;
  const value=base[key];
  if(!Number.isFinite(value))continue;
  const roll=Math.min(0.999999,Math.max(0,random()));
  const result=value*(1+(roll*2-1)*NPC_STAT_VARIANCE);
  varied[key]=Math.round(Math.max(0,result)*100)/100;
 }
 return varied as T;
}
