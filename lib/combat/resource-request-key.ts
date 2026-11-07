import type {CombatState,Side} from "./turn-engine.ts";

/**
 * Correlates a retry with the precise encounter snapshot AND the intended
 * resource action. A lost POST response must reuse the same request ID while
 * the view is unchanged, but a genuine second cast in the same round must
 * obtain a new ID after polling the updated combat state.
 *
 * This is only a client-side key: the server's persisted request ledgers remain
 * the source of truth for idempotency and all resource expenditures.
 */
export function combatResourceRequestKey<T extends {
 kind:"CAST_SKILL"|"BOOST_KARMA"|"USE_ITEM";requestId?:string
}>(
 encounterId:string,side:Side,state:CombatState|undefined,command:T,
):string {
 const actor=state?.actors[side];
 // Intentionally exclude any previously generated ID from the intent.
 const {requestId:_,...intent}=command;
 const last=state?.log.at(-1);
 return JSON.stringify([
  encounterId,side,state?.round,state?.tick,
  actor?.spentTicks,actor?.spentAp,
  state?.pending?.by,state?.pending?.launchedAtTick,
  last?.kind,last?.tick,last?.summary,
  intent,
 ]);
}
