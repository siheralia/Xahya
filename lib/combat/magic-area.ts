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

export function magicImpactZone(center:Point):string {
 if(!validArenaPoint(center))throw new Error("Centro mágico inválido.");
 const y=center.y<1/3?"superior":center.y<2/3?"central":"inferior";
 const x=center.x<1/3?"izquierda":center.x<2/3?"centro":"derecha";
 return y==="central"&&x==="centro"?"centro":y==="central"?"zona "+x:y+" "+x;
}
export function guessedMagicCenter(actual:Point,guess:Point):boolean {
 if(!validArenaPoint(actual)||!validArenaPoint(guess))return false;
 return Math.hypot(actual.x-guess.x,actual.y-guess.y)<=MAGIC_GUESS_TOLERANCE;
}

/** Only a coarse 3x3 warning is sent during a pending magical attack.
 * The true epicenter stays exclusively in the persisted server-side state,
 * including when a request has moderator access to both combatants.
 */
export function combatClientView(state:CombatState):CombatState {
 if(!state.pending?.usesMagic||!state.pending.targetCenter)return state;
 const clone=structuredClone(state);
 if(clone.pending)delete clone.pending.targetCenter;
 return clone;
}
