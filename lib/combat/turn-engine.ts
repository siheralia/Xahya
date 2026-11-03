import { calculateActionTicks, COMBAT_TICKS_PER_TURN } from "./ticks.ts";
import type { CombatAttackType } from "./ticks";
import type { CombatDefenseType } from "./matchup-types.ts";

export type Side = "PLAYER" | "NPC";
export type DefenseChoice = "DODGE" | "BLOCK" | "ENDURE" | "REPEL" | "DEFLECT" | "NONE";
export type Point = { x: number; y: number };
export type CombatFighter = {
  characterId: number | null; name: string; hp: number; maxHp: number;
  agility: number; speedValue?: number; strength: number; constitution: number; precision: number;
  dodge: number; physicalAttack: number; physicalDefense: number;
  magicAttack: number; magicDefense: number; critical: number; luck: number;
  race: number; massKg: number; positionMeters: number; attackType: CombatAttackType;
  defenseType: CombatDefenseType; weaponIntegrity: number;
  spentTicks: number; spentAp: number;
};
export type PendingAttack = {
  by: Side; against: Side; attackType: CombatAttackType;
  trajectory: Point[]; launchedAtTick: number; usesMagic: boolean;
};
export type CombatLog = {
  kind: string; tick: number; by: Side; against?: Side; summary: string;
  damage?: number; critical?: boolean; contact?: boolean;
  knockbackMeters?: number; weaponIntegrity?: number; defense?: DefenseChoice;
};
export type CombatState = {
  version: 1; round: number; tick: number; status: "ACTIVE" | "FINISHED";
  winner: Side | null; actors: Record<Side, CombatFighter>;
  /** Randomly resolved initial initiative tie; absent in older persisted fights. */
  tieOpener?: Side;
  pending: PendingAttack | null; log: CombatLog[];
};
export type CombatCommand =
  | { kind: "MOVE"; meters: number; direction?: "TOWARD" | "AWAY" }
  | { kind: "WAIT" }
  | { kind: "ATTACK"; attackType: CombatAttackType; trajectory?: Point[]; usesMagic?: boolean }
  | { kind: "DEFEND"; defense: DefenseChoice; defenseAngle?: number };

const SIDES: Side[] = ["PLAYER", "NPC"];
const LIMIT = COMBAT_TICKS_PER_TURN;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const other = (side: Side): Side => side === "PLAYER" ? "NPC" : "PLAYER";
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
const normalize = (n: number) => Math.max(0, finite(n) ? n : 0);
const safePoint = (p: Point) => finite(p?.x) && finite(p?.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const addLog = (state: CombatState, entry: CombatLog) => { state.log.push(entry); state.log = state.log.slice(-100); };
export const actionPoints = (constitution: number) => Math.max(1, Math.floor(9 + normalize(constitution)));
export const weaponIntegrityDefault = 100;
export const massDefaultKg = 70;

/**
 * Explicit RPS matrix: a sweep beats a diffuse field, a blunt impact breaks
 * solid resistance, a piercing strike defeats concentrated protection.
 * A losing matchup is -20%; a winning matchup +20%; otherwise neutral.
 */
const WINS: Record<CombatAttackType, CombatDefenseType> = {
  CUT: "DISPERSED", BLUNT: "SOLID", PIERCE: "CONCENTRATED",
};
const LOSES: Record<CombatAttackType, CombatDefenseType> = {
  CUT: "CONCENTRATED", BLUNT: "DISPERSED", PIERCE: "SOLID",
};
export function matchupMultiplier(attack: CombatAttackType, defense: CombatDefenseType) {
  return WINS[attack] === defense ? 1.2 : LOSES[attack] === defense ? 0.8 : 1;
}
export function contestChance(offense: number, resistance: number) {
  const a = normalize(offense), b = normalize(resistance);
  return clamp(0.5 + (a - b) / (2 * (a + b + 20)), 0.05, 0.95);
}
function validateRoll(value: number) {
  if (!finite(value) || value < 0 || value >= 1) throw new Error("Tirada inválida.");
}
function validateFighter(f: CombatFighter) {
  if (!f || typeof f.name !== "string" || !finite(f.hp) || !finite(f.maxHp) || f.maxHp < 1 || f.hp < 0 || f.hp > f.maxHp
    || !finite(f.massKg) || f.massKg <= 0 || !finite(f.positionMeters) || !finite(f.weaponIntegrity) || f.weaponIntegrity < 0 || f.weaponIntegrity > 100)
    throw new Error("Combatiente inválido.");
}
export function newCombatState(player: CombatFighter, npc: CombatFighter, tieOpener: Side="PLAYER"): CombatState {
  validateFighter(player); validateFighter(npc);
  if (!SIDES.includes(tieOpener)) throw new Error("Iniciativa inicial inválida.");
  return {version:1,round:1,tick:0,status:"ACTIVE",winner:null,tieOpener,
    actors:{PLAYER:{...player,spentTicks:0,spentAp:0},NPC:{...npc,spentTicks:0,spentAp:0}},
    pending:null,log:[]};
}
export const effectiveCombatSpeed = (f: CombatFighter) =>
  Math.max(1, f.speedValue ?? f.agility);
export function turnTicks(f: CombatFighter, attackType?: CombatAttackType) {
  const modifier = attackType === "BLUNT" ? 1.15 : attackType === "PIERCE" ? 0.85 : 1;
  return calculateActionTicks(effectiveCombatSpeed(f), modifier);
}
export function remainingAp(f: CombatFighter) {
  return Math.max(0, actionPoints(f.constitution) - f.spentAp);
}
const hasInitiativeBudget = (f: CombatFighter) =>
  remainingAp(f) >= 1 && f.spentTicks < LIMIT;

/**
 * Only proactive actions (ATTACK, MOVE, WAIT) take an initiative slot.
 * Defending an incoming attack is a paid reaction, but does not count as
 * taking the defender's initiative. A ROUND entry resets the tie order.
 * This is derived from the persisted event log, so existing encounters
 * do not need a migration or a new saved-state version.
 */
function lastInitiativeSide(state: CombatState): Side | null {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const {kind, by} = state.log[i];
    if (kind === "ROUND") break;
    if (kind === "ATTACK" || kind === "MOVE" || kind === "WAIT") return by;
  }
  return null;
}
export function canAct(state: CombatState, side: Side): boolean {
  if (state.status !== "ACTIVE" || state.pending) return false;
  const f = state.actors[side], rival = state.actors[other(side)];
  if (!hasInitiativeBudget(f)) return false;
  if (effectiveCombatSpeed(f) === effectiveCombatSpeed(rival)) {
    // Equal speed: strict alternating initiative. Reactions consume ticks/AP
    // but never allow an actor to take two consecutive proactive actions if
    // the opponent has an opportunity to take one.
    const last = lastInitiativeSide(state);
    if (last === null) {
      // Rotate who opens the round on a speed tie.
      const first = state.tieOpener ?? "PLAYER";
      const opener: Side = state.round % 2 === 1 ? first : other(first);
      return side === opener || !hasInitiativeBudget(rival);
    }
    return last !== side || !hasInitiativeBudget(rival);
  }
  // Unequal speed: at most one opponent-sized action of temporal lead.
  // At twice the other's speed, two short movements fit before one of theirs.
  return f.spentTicks < rival.spentTicks + turnTicks(rival);
}
function advanceRoundIfComplete(state: CombatState) {
  const finished = (side: Side) => {
    const f = state.actors[side];
    return f.spentTicks >= LIMIT || remainingAp(f) === 0;
  };
  if (state.status === "ACTIVE" && !state.pending && SIDES.every(finished)) {
    state.round++;
    for (const side of SIDES) {
      state.actors[side].spentTicks = 0;
      state.actors[side].spentAp = 0;
    }
    addLog(state,{kind:"ROUND",tick:state.tick,by:"PLAYER",summary:"Comienza el turno " + state.round});
  }
}
function spend(f: CombatFighter, ticks: number) {
  f.spentAp++;
  f.spentTicks = Math.min(LIMIT, f.spentTicks + ticks);
}
function direction(path: Point[]) {
  const a = path.length > 1 ? path[path.length-2] : {x:0.1,y:0.5};
  const b = path.length ? path[path.length-1] : {x:0.9,y:0.5};
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}
export function deflectionAlignment(trajectory: Point[], guardAngle: number) {
  // Guard should cross the incoming tangent at ~90 degrees.
  const diff = Math.abs(((direction(trajectory) - guardAngle + 540) % 180) - 90);
  return clamp(1 - diff / 90, 0, 1);
}
export function knockbackMeters(force: number, resistance: number, massKg = massDefaultKg) {
  return Math.round(clamp((normalize(force)-normalize(resistance)*0.6)*0.06*massDefaultKg/Math.max(1,massKg),0,12)*100)/100;
}
/**
 * Pure deterministic transition; server owns the dice. No wall-clock timer
 * consumes action ticks. Reaction is a separate choice, not a free extra dodge.
 */
export function applyCombatCommand(original: CombatState, by: Side, command: CombatCommand,
  rolls: {hit:number; critical:number; defense:number} = {hit:0.5,critical:0.5,defense:0.5}): CombatState {
  const state = structuredClone(original);
  if (state.version !== 1 || state.status !== "ACTIVE") throw new Error("El combate no está activo.");
  if (!SIDES.includes(by)) throw new Error("Combatiente no válido.");
  const fighter = state.actors[by], rival = state.actors[other(by)];
  if (state.pending) {
    const pending = state.pending;
    if (command.kind !== "DEFEND" || pending.against !== by) throw new Error("Debe responder al ataque pendiente.");
    if (!["DODGE","BLOCK","ENDURE","REPEL","DEFLECT","NONE"].includes(command.defense))
      throw new Error("Defensa desconocida.");
    validateRoll(rolls.hit); validateRoll(rolls.critical); validateRoll(rolls.defense);
    const attacker = state.actors[pending.by];
    let defense = command.defense;
    if (remainingAp(fighter) <= 0 || fighter.spentTicks >= LIMIT) defense = "NONE";
    if (defense !== "NONE") spend(fighter, turnTicks(fighter));
    const power = pending.usesMagic ? attacker.magicAttack : attacker.physicalAttack;
    const protection = pending.usesMagic ? fighter.magicDefense : fighter.physicalDefense;
    const typeFactor = matchupMultiplier(pending.attackType, fighter.defenseType);
    let avoided = false;
    let damageScale = 1;
    let displaced = 0;
    if (defense === "DODGE") {
      avoided = rolls.hit >= contestChance(attacker.precision, fighter.dodge);
    } else if (defense === "BLOCK") {
      const contest = contestChance(fighter.constitution * typeFactor, attacker.strength);
      const held = fighter.weaponIntegrity > 0 && rolls.defense < contest;
      // Tool durability never substitutes for the wielder's CON.
      damageScale = held ? 0.12 : 0.8;
      fighter.weaponIntegrity = Math.max(0, fighter.weaponIntegrity - Math.max(1,Math.ceil(power / 8)));
    } else if (defense === "ENDURE") {
      damageScale = rolls.defense < contestChance(fighter.constitution,attacker.strength) ? 0.45 : 1;
    } else if (defense === "REPEL") {
      const won = rolls.defense < contestChance(fighter.strength,attacker.strength);
      damageScale = won ? 0.3 : 1;
      if (won) displaced = knockbackMeters(fighter.strength,attacker.constitution,attacker.massKg);
    } else if (defense === "DEFLECT") {
      const angle = Number(command.defenseAngle ?? 90);
      if (!finite(angle) || angle < 0 || angle >= 360) throw new Error("Ángulo inválido.");
      const alignment = deflectionAlignment(pending.trajectory,angle);
      const success = rolls.defense < contestChance(fighter.agility * (0.5+alignment), attacker.strength);
      avoided = success && alignment >= 0.55;
      if (!avoided) damageScale = 0.85;
    }
    // No selected dodge means contact is checked against a small base margin,
    // not another invisible full Esquive roll.
    const contact = !avoided;
    const critical = contact && rolls.critical < clamp(0.05 + attacker.critical / (attacker.critical + fighter.luck + 100)*0.20,0.05,0.25);
    const raw = Math.max(1, Math.round(power * (critical?1.5:1) * typeFactor - protection * 0.75));
    const damage = contact ? Math.max(0, Math.round(raw * damageScale)) : 0;
    fighter.hp = Math.max(0, fighter.hp - damage);
    if (contact && damage > 0 && displaced === 0 && !pending.usesMagic)
      displaced = knockbackMeters(attacker.strength, fighter.constitution, fighter.massKg) * (defense === "BLOCK" ? 0.25 : 1);
    if (displaced > 0) {
      if (defense === "REPEL" && damageScale < 1) {
        const sign = Math.sign(attacker.positionMeters - fighter.positionMeters) || 1;
        attacker.positionMeters += sign * displaced;
      } else {
        const sign = Math.sign(fighter.positionMeters - attacker.positionMeters) || 1;
        fighter.positionMeters += sign * displaced;
      }
    }
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT + attacker.spentTicks,(state.round-1)*LIMIT + fighter.spentTicks);
    addLog(state,{kind:"RESOLVE",tick:state.tick,by:pending.by,against:by,damage,critical,
      contact,knockbackMeters:Math.round(displaced*100)/100,weaponIntegrity:fighter.weaponIntegrity,defense,
      summary:avoided ? fighter.name + " evitó el ataque" : attacker.name + " impactó a " + fighter.name + " (" + damage + " HP)"});
    state.pending = null;
    if (fighter.hp <= 0) {
      state.status = "FINISHED";state.winner = pending.by;
      addLog(state,{kind:"END",tick:state.tick,by:pending.by,against:by,summary:attacker.name+" gana el combate"});
    }
    advanceRoundIfComplete(state);
    return state;
  }
  if (command.kind === "DEFEND") throw new Error("No existe un ataque pendiente.");
  if (!canAct(state,by)) throw new Error("Espera el movimiento del otro participante o el siguiente turno.");
  if (command.kind === "MOVE") {
    const maximum = Math.max(1,Math.round(normalize(fighter.race)/10));
    if (!finite(command.meters) || command.meters < 0 || command.meters > maximum)
      throw new Error("Desplazamiento fuera del alcance por acción: " + maximum + " m.");
    const direction = command.direction??"TOWARD";
    if (!["TOWARD","AWAY"].includes(direction)) throw new Error("Dirección inválida.");
    const sign = Math.sign(rival.positionMeters-fighter.positionMeters)||1;
    const magnitude = direction==="AWAY" ? -command.meters : Math.min(command.meters,Math.abs(rival.positionMeters-fighter.positionMeters));
    fighter.positionMeters += sign*magnitude;
    spend(fighter,turnTicks(fighter));
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"MOVE",tick:state.tick,by,
      summary:fighter.name+" se desplazó "+command.meters+" m ("+direction+")"});
  } else if (command.kind === "WAIT") {
    fighter.spentTicks = LIMIT;
    fighter.spentAp = actionPoints(fighter.constitution);
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"WAIT",tick:state.tick,by,summary:fighter.name+" finaliza su participación en el turno"});
  } else if (command.kind === "ATTACK") {
    if (!["CUT","BLUNT","PIERCE"].includes(command.attackType)) throw new Error("Tipo de ataque inválido.");
    const points = command.trajectory?.length ? command.trajectory : [{x:0.1,y:0.5},{x:0.9,y:0.5}];
    if (!Array.isArray(points) || points.length < 2 || points.length > 80 || points.some(p => !safePoint(p)))
      throw new Error("Trayectoria inválida.");
    if (Math.abs(fighter.positionMeters-rival.positionMeters)>2)
      throw new Error("El objetivo está fuera del alcance físico de 2 m.");
    spend(fighter,turnTicks(fighter,command.attackType));
    state.pending = {by,against:other(by),attackType:command.attackType,
      trajectory:points,launchedAtTick:(state.round-1)*LIMIT+fighter.spentTicks,usesMagic:command.usesMagic===true};
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"ATTACK",tick:state.tick,by,against:other(by),summary:fighter.name+" atacó; esperando reacción"});
  } else throw new Error("Acción inválida.");
  state.tick = Math.max(state.tick,(state.round-1)*LIMIT + fighter.spentTicks);
  advanceRoundIfComplete(state);
  return state;
}
