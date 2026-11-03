/**
 * Training NPCs are comparable to the challenger's base statistics, not exact
 * clones. Vary non-speed base stats in whole points (roughly ±8%,
 * minimum ±1 possible for small attributes). AGI is deliberately mirrored
 * so equal-speed sparring keeps exercising the
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
  const integer=Math.max(0,Math.round(value));
  if(integer===0){varied[key]=0;continue;}
  const maxChange=Math.max(1,Math.round(integer*NPC_STAT_VARIANCE));
  const roll=Math.min(0.999999,Math.max(0,random()));
  const delta=Math.floor(roll*(maxChange*2+1))-maxChange;
  varied[key]=Math.max(1,integer+delta);
 }
 return varied as T;
}
