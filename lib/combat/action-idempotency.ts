import {createHash} from "node:crypto";
import type {CombatCommand, CombatState, Side} from "./turn-engine.ts";

/** Only externally submitted non-resource actions are replayed by this ledger.
 * Skills, items and karma keep their existing independent request registries.
 * NPC policy actions are internal and never require a client request ID.
 */
export type ReplayableCombatCommand =
 Extract<CombatCommand,{kind:"MOVE"|"WAIT"|"ATTACK"|"DEFEND"|"COMMAND_SUMMON"}> |
 {kind:"ADVANCE";requestId?:string};

export function isReplayableCombatKind(kind:unknown):kind is ReplayableCombatCommand["kind"] {
 return kind==="MOVE"||kind==="WAIT"||kind==="ATTACK"||kind==="DEFEND"||kind==="COMMAND_SUMMON"||kind==="ADVANCE";
}

const validRequestId=(id:unknown):id is string=>
 typeof id==="string"&&/^[a-zA-Z0-9:_-]{12,100}$/.test(id);

/** Canonicalize JSON values so reordering object keys on retransmission
 * does not change the action identity. Arrays (trajectories) remain ordered.
 */
function stableJson(value:unknown):string {
 if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";
 if(value!==null&&typeof value==="object"){
  const row=value as Record<string,unknown>;
  return "{"+Object.keys(row).filter(key=>row[key]!==undefined).sort()
   .map(key=>JSON.stringify(key)+":"+stableJson(row[key])).join(",")+"}";
 }
 return JSON.stringify(value)??"null";
}
function actionSignature(side:Side,command:ReplayableCombatCommand):string {
 const {requestId:_,...payload}=command;
 return createHash("sha256").update(stableJson({side,command:payload})).digest("hex");
}

/** Read under the row lock, before checking ACTIVE or rerolling dice.
 * A byte-identical retry stays successful even after a completed encounter.
 * A recycled ID with changed side/payload is rejected instead of silently
 * accepting a different action.
 */
export function isCombatActionReplay(state:CombatState,side:Side,command:ReplayableCombatCommand):boolean {
 if(!validRequestId(command.requestId))
  throw new Error("Identificador de acción inválido. Actualiza la página y reintenta.");
 const previous=state.processedActionRequests?.find(row=>row.id===command.requestId);
 if(!previous)return false;
 if(previous.side!==side||previous.signature!==actionSignature(side,command))
  throw new Error("Identificador reutilizado para una acción diferente.");
 return true;
}

/** Called exactly once after a successful combat action and optional NPC
 * continuation. Stored in combatV1 within the same locked transaction as
 * HP, mana, AP, ticks, inventory wear and logs. Optional on legacy sessions.
 */
export function recordCombatAction(
 before:CombatState,after:CombatState,side:Side,command:ReplayableCombatCommand,
):CombatState {
 if(isCombatActionReplay(before,side,command))return before;
 return {
  ...after,
  processedActionRequests:[
   ...(before.processedActionRequests??[]),
   {id:command.requestId!,side,signature:actionSignature(side,command)},
  ],
 };
}
