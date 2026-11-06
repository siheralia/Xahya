/**
 * Durability accounting for a serialized combat action. An action may both
 * wear a weapon during BLOCK and repair that same copy when the next round
 * begins, so the net difference does not equal total wear.
 *
 * All deltas are computed from the SERVER's previous encounter snapshot.
 * The DB still applies the result against its current row under row locks.
 */
const integrity=(value:number):boolean=>Number.isSafeInteger(value)&&value>=0&&value<=100;
export function weaponWearSinceSnapshot(
 before:number,after:number,restored:number
):number{
 if(!integrity(before)||!integrity(after)||
    !Number.isSafeInteger(restored)||restored<0||restored>100)
  throw new Error("Durabilidad o reparación de combate inválida.");
 const wear=before+restored-after;
 if(wear<0||wear>100)
  throw new Error("La durabilidad aumentó sin una reparación autorizada.");
 return wear;
}
/** Pure mirror of the SQL write: previous persistent wear from a parallel
 * encounter is never undone; the authorized repair is added once only.
 */
export function persistedDurabilityAfterAction(
 persisted:number,before:number,after:number,restored:number
):number{
 if(!integrity(persisted))throw new Error("Durabilidad persistida inválida.");
 const wear=weaponWearSinceSnapshot(before,after,restored);
 return Math.max(0,Math.min(100,Math.min(persisted,before)-wear+restored));
}
