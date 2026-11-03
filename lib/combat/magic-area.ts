import type { CombatState, Point } from "./turn-engine.ts";

/** Phase-1 abstract aiming arena: independently projected from the 1D distance system. */
export const BASIC_MAGIC_AREA_RADIUS = 0.14;
export const BASIC_MAGIC_RANGE_METERS = 10;
export const BASIC_MAGIC_MANA_COST = 0; // Phase 2 will introduce paid abilities.
export const MAGIC_GUESS_TOLERANCE = 0.19;

export const validArenaPoint = (p:unknown):p is Point => {
 const candidate=p as Point|null;
 return !!candidate && typeof candidate.x==="number" && Number.isFinite(candidate.x)
  && typeof candidate.y==="number" && Number.isFinite(candidate.y)
  && candidate.x>=0 && candidate.x<=1 && candidate.y>=0 && candidate.y<=1;
};

/** The two nearest columns and two nearest rows of the 3×3 grid form
 * a public 2×2 warning. Thus corners reveal four cells, not one; an
 * impact in cell 5 near cell 9 reveals 5,6,8,9. */
export function magicImpactZone(center:Point):string {
 if(!validArenaPoint(center))throw new Error("Centro mágico inválido.");
 return (center.y<0.5?"superior":"inferior")+" "+(center.x<0.5?"izquierda":"derecha");
}

/** Zero-based 3×3 cell indices highlighted for the defender. */
export function magicHintCells(hint:string):number[] {
 const startRow=hint.includes("inferior")?1:0;
 const startColumn=hint.includes("derecha")?1:0;
 return [
  startRow*3+startColumn,startRow*3+startColumn+1,
  (startRow+1)*3+startColumn,(startRow+1)*3+startColumn+1,
 ];
}
export function guessedMagicCenter(actual:Point,guess:Point):boolean {
 if(!validArenaPoint(actual)||!validArenaPoint(guess))return false;
 return Math.hypot(actual.x-guess.x,actual.y-guess.y)<=MAGIC_GUESS_TOLERANCE;
}

/** Only a coarse four-cell 2×2 warning is sent during a pending magical attack.
 * The true epicenter stays exclusively in the persisted server-side state,
 * including when a request has moderator access to both combatants.
 */
export function combatClientView(state:CombatState):CombatState {
 if(!state.pending?.usesMagic||!state.pending.targetCenter)return state;
 const clone=structuredClone(state);
 if(clone.pending) {
  // Upgrade old pending 3×3 hints without exposing their exact epicenter.
  clone.pending.areaHint=magicImpactZone(state.pending.targetCenter);
  delete clone.pending.targetCenter;
 }
 return clone;
}
