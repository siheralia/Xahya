import { calculateActionTicks, COMBAT_TICKS_PER_TURN } from "./ticks.ts";
import type { CombatAttackType } from "./ticks";
import type { CombatDefenseType } from "./matchup-types.ts";
import type { CombatSkillPlan,CombatBuffStat } from "./skill-casting.ts";
import { geometricContact } from "./geometry.ts";
import { BASIC_MAGIC_RANGE_METERS, guessedMagicCenter, magicImpactZone, validArenaPoint } from "./magic-area.ts";

export type Side = "PLAYER" | "NPC";
export type DefenseChoice = "DODGE" | "BLOCK" | "ENDURE" | "REPEL" | "DEFLECT" | "MAGIC_FIELD" | "NONE";
export type Point = { x: number; y: number };
export type PhysicalAttackSource = "MAIN_HAND" | "OFF_HAND" | "FIST_RIGHT" | "FIST_LEFT";
export type CombatWeapon = {name:string;attackType:CombatAttackType;mode:"MELEE"|"RANGED";effectiveRangeMeters:number;maximumRangeMeters?:number;throwable?:boolean;throwRangeMeters?:number;itemId?:number};
export type CombatFighter = {
  characterId: number | null; name: string; hp: number; maxHp: number;
  agility: number; speedValue?: number; strength: number; constitution: number; precision: number;
  dodge: number; physicalAttack: number; physicalDefense: number;
  magicAttack: number; magicDefense: number; critical: number; luck: number;
  race: number; massKg: number; positionMeters: number; attackType: CombatAttackType;
  heightMeters?: number; unarmedReachMeters?: number;
  equippedWeapon?: CombatWeapon;
  offhandWeapon?: CombatWeapon;
  defenseType: CombatDefenseType; magicFieldType?: CombatDefenseType;
  magicFieldDescription?: string | null; weaponIntegrity: number;
  spentTicks: number; spentAp: number;
};
export type PendingAttack = {
  by: Side; against: Side; attackType: CombatAttackType;
  trajectory: Point[]; launchedAtTick: number; usesMagic: boolean;
  rangedPhysical?: boolean; thrownWeapon?:boolean; beyondEffectiveRange?:boolean;
  attackSource?: PhysicalAttackSource;
  /** Hidden from client while pending; attacker-selected basic magic blast. */
  targetCenter?: Point;
  /** Coarse, public four-cell telegraph; never reveals the exact impact point. */
  areaHint?: string;
  skill?: {id:number;name:string;damageMultiplier:number;defenseFactor:number;finalMultiplier:number};
};
export type CombatLog = {
  kind: string; tick: number; by: Side; against?: Side; summary: string;
  damage?: number; critical?: boolean; contact?: boolean;
  knockbackMeters?: number; weaponIntegrity?: number; defense?: DefenseChoice;
  attackType?: CombatAttackType; rangedPhysical?: boolean; predictionMatched?: boolean;
  attackSource?: PhysicalAttackSource;
  areaCenter?: Point; predictedCenter?: Point;
  skillId?: number; manaCost?: number;
};
export type CombatState = {
  version: 1; round: number; tick: number; status: "ACTIVE" | "FINISHED";
  winner: Side | null; actors: Record<Side, CombatFighter>;
  /** Randomly resolved initial initiative tie; absent in older persisted fights. */
  tieOpener?: Side;
  /** Last physical stroke endpoint for each combatant; cleared on movement. */
  physicalPathEnd?: Partial<Record<Side, Point>>;
  physicalPathEnds?: Partial<Record<Side, Partial<Record<PhysicalAttackSource, Point>>>>;
  /** Encounter-local mana snapshot: never debits the global character sheet. */
  mana?: Record<Side,{current:number;max:number}>;
  skillCooldowns?: Partial<Record<Side,Record<string,number>>>;
  skillBonuses?: Array<{by:Side;skillId:number;stat:CombatBuffStat;value:number;expiresAtRound:number}>;
  processedSkillRequests?: string[];
  droppedWeapons?: Array<{owner:Side;weapon:CombatWeapon;slot?:"MAIN_HAND"|"OFF_HAND";positionMeters:number}>;
  pending: PendingAttack | null; log: CombatLog[];
};
export type CombatCommand =
  | { kind: "MOVE"; meters: number; direction?: "TOWARD" | "AWAY" | "WEAPON"; weaponSlot?:"MAIN_HAND"|"OFF_HAND" }
  | { kind: "WAIT" }
  | { kind: "ATTACK"; attackType: CombatAttackType; trajectory?: Point[]; usesMagic?: boolean; rangedPhysical?: boolean; throwWeapon?:boolean; attackSource?: PhysicalAttackSource; areaCenter?: Point }
  | { kind: "DEFEND"; defense: DefenseChoice; defenseAngle?: number; predictedCenter?: Point; dodgeDirection?:"AWAY"|"TOWARD"|"WEAPON"; weaponSlot?:"MAIN_HAND"|"OFF_HAND" }
  | { kind: "CAST_SKILL";skillId:number;requestId:string;trajectory?:Point[];areaCenter?:Point;attackSource?:PhysicalAttackSource };

const SIDES: Side[] = ["PLAYER", "NPC"];
const LIMIT = COMBAT_TICKS_PER_TURN;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const other = (side: Side): Side => side === "PLAYER" ? "NPC" : "PLAYER";
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
const normalize = (n: number) => Math.max(0, finite(n) ? n : 0);
/** The duel canvas represents the defender at its normalized center.
 * Its world-space separation is checked independently in meters. */
export const targetHitboxCenter: Point = {x:0.5,y:0.5};
export function defaultAttackSource(f:CombatFighter):PhysicalAttackSource {
 return f.equippedWeapon?"MAIN_HAND":f.offhandWeapon?"OFF_HAND":"FIST_RIGHT";
}
export function weaponForSource(f:CombatFighter,source:PhysicalAttackSource):CombatWeapon|undefined {
 return source==="MAIN_HAND"?f.equippedWeapon:source==="OFF_HAND"?f.offhandWeapon:undefined;
}
export function effectiveWeaponReachMeters(f:CombatFighter, thrown=false, source:PhysicalAttackSource=defaultAttackSource(f)):number {
 const weapon=weaponForSource(f,source);
 if(thrown)return weapon?.throwable?Math.max(0,weapon.throwRangeMeters??0):0;
 if(weapon)return Math.max(0,weapon.maximumRangeMeters??weapon.effectiveRangeMeters);
 return Math.max(0.3,f.unarmedReachMeters??(f.heightMeters??1.7)*0.45);
}
function clearPhysicalStrokes(state:CombatState,side:Side){
 if(state.physicalPathEnd)delete state.physicalPathEnd[side];
 if(state.physicalPathEnds)delete state.physicalPathEnds[side];
}
function activeDroppedWeapon(state:CombatState,by:Side,slot?:"MAIN_HAND"|"OFF_HAND"){
 return state.droppedWeapons?.find(w=>w.owner===by&&(!slot||(w.slot??"MAIN_HAND")===slot));
}
function restoreWeapon(state:CombatState,dropped:NonNullable<CombatState["droppedWeapons"]>[number]):boolean {
 const fighter=state.actors[dropped.owner];
 const field=(dropped.slot??"MAIN_HAND")==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
 if(fighter[field])return false;
 fighter[field]={...dropped.weapon};
 state.droppedWeapons=state.droppedWeapons?.filter(w=>w!==dropped);
 return true;
}
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
    physicalPathEnd:{},physicalPathEnds:{},pending:null,log:[]};
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
    if (kind === "ATTACK" || kind === "MOVE" || kind === "WAIT" || kind === "SKILL") return by;
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
/** Combat equipment is a snapshot: the persistent character inventory is never
 * debited by a throw. Recover any still-dropped weapon at encounter completion
 * so the resulting combat state cannot contradict the original equipment. */
function settleDroppedWeapons(state:CombatState) {
  for(const dropped of [...(state.droppedWeapons??[])]){
    if(restoreWeapon(state,dropped)) {
      addLog(state,{kind:"RECOVER",tick:state.tick,by:dropped.owner,
        summary:state.actors[dropped.owner].name+" recuperó "+dropped.weapon.name+" al finalizar el combate"});
    }
  }
  state.droppedWeapons=[];
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
    // Buffs use the same persisted round clock as normal initiatives.
    const active=state.skillBonuses??[];
    for(const bonus of active.filter(b=>b.expiresAtRound<=state.round)){
      const fighter=state.actors[bonus.by];
      fighter[bonus.stat]=Math.max(0,fighter[bonus.stat]-bonus.value);
    }
    state.skillBonuses=active.filter(b=>b.expiresAtRound>state.round);
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
/** A character resumes a physical stroke at the previous endpoint until moved.
 * Older saved encounters without this optional property remain usable. */
export function physicalAttackStart(state: CombatState, by: Side, requested?:PhysicalAttackSource): Point | null {
  const source=requested??defaultAttackSource(state.actors[by]);
  const perSource=state.physicalPathEnds?.[by];
  // Older encounters only had a single stroke for their default weapon.
  const anchor=perSource?perSource[source]:(requested===undefined||source===defaultAttackSource(state.actors[by])?state.physicalPathEnd?.[by]:undefined);
  return anchor && safePoint(anchor)?anchor:null;
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
  rolls: {hit:number; critical:number; defense:number} = {hit:0.5,critical:0.5,defense:0.5},
  serverSkillRangeMeters?:number): CombatState {
  const state = structuredClone(original);
  if (state.version !== 1 || state.status !== "ACTIVE") throw new Error("El combate no está activo.");
  if (!SIDES.includes(by)) throw new Error("Combatiente no válido.");
  const fighter = state.actors[by], rival = state.actors[other(by)];
  if (state.pending) {
    const pending = state.pending;
    if (command.kind !== "DEFEND" || pending.against !== by) throw new Error("Debe responder al ataque pendiente.");
    if (!["DODGE","BLOCK","ENDURE","REPEL","DEFLECT","MAGIC_FIELD","NONE"].includes(command.defense))
      throw new Error("Defensa desconocida.");
    validateRoll(rolls.hit); validateRoll(rolls.critical); validateRoll(rolls.defense);
    const attacker = state.actors[pending.by];
    let defense = command.defense;
    if (pending.usesMagic && !["DODGE","ENDURE","MAGIC_FIELD","NONE"].includes(defense))
      throw new Error("Para la explosión mágica básica puedes esquivar, levantar un campo mágico, resistir o no reaccionar.");
    if (!pending.usesMagic && defense === "MAGIC_FIELD")
      throw new Error("El campo defensivo mágico solo puede responder a ataques mágicos.");
    if (remainingAp(fighter) <= 0 || fighter.spentTicks >= LIMIT) defense = "NONE";
    if(defense==="MAGIC_FIELD"){
      const mana=state.mana?.[by];
      if(!mana || mana.current<1)throw new Error("Necesitas 1 punto de maná para activar el campo mágico.");
      mana.current-=1;
    }
    if (defense !== "NONE") spend(fighter, turnTicks(fighter));
    const power = pending.usesMagic ? attacker.magicAttack : attacker.physicalAttack;
    const protection = pending.usesMagic ? fighter.magicDefense : fighter.physicalDefense;
    // The magical field uses its own basic RPS type from the character sheet;
    // physical blocking retains the separately configured blockDefenseType.
    const defenseType=pending.usesMagic?(fighter.magicFieldType??fighter.defenseType):fighter.defenseType;
    const typeFactor = matchupMultiplier(pending.attackType, defenseType);
    let avoided = false;
    let damageScale = 1;
    let displaced = 0;
    if (defense === "DODGE") {
      if (pending.usesMagic || pending.rangedPhysical) {
        if (!validArenaPoint(pending.targetCenter)) throw new Error("Centro de ataque ausente.");
        if (!validArenaPoint(command.predictedCenter)) throw new Error("Marca dónde crees que caerá la explosión.");
        // Spatial prediction plus a genuine agility/precision contest.
        // The target was stored privately, never returned by the combat API.
        avoided = Math.hypot(pending.targetCenter.x-command.predictedCenter.x,pending.targetCenter.y-command.predictedCenter.y)
          <= (pending.rangedPhysical ? (pending.attackType==="BLUNT"?0.12:pending.attackType==="CUT"?0.085:0.045) : pending.attackType==="BLUNT"?0.19:pending.attackType==="CUT"?0.11:0.07)
          && rolls.hit >= contestChance(attacker.precision, fighter.dodge);
      } else {
        avoided = rolls.hit >= contestChance(attacker.precision, fighter.dodge);
      }
    } else if (defense === "BLOCK") {
      const contest = contestChance(fighter.constitution * typeFactor, attacker.strength);
      const held = fighter.weaponIntegrity > 0 && rolls.defense < contest;
      // Tool durability never substitutes for the wielder's CON.
      damageScale = held ? 0.12 : 0.8;
      fighter.weaponIntegrity = Math.max(0, fighter.weaponIntegrity - Math.max(1,Math.ceil(power / 8)));
    } else if (defense === "MAGIC_FIELD") {
      // Basic defensive field: active reaction, paid AP/ticks, no persistent
      // barrier or mana expenditure until the configurable-skills phase.
      const effectiveField=Math.max(0,fighter.magicDefense)/typeFactor;
      const held=rolls.defense < contestChance(effectiveField,attacker.magicAttack);
      damageScale=held ? 0.25 : 0.75;
    } else if (defense === "ENDURE") {
      damageScale = rolls.defense < contestChance(fighter.constitution,attacker.strength) ? 0.45 : 1;
    } else if (defense === "REPEL") {
      const won = rolls.defense < contestChance(fighter.strength,attacker.strength);
      damageScale = won ? 0.3 : 1;
      if (won) displaced = knockbackMeters(fighter.strength,attacker.constitution,attacker.massKg);
    } else if (defense === "DEFLECT") {
      const angle = Number(command.defenseAngle ?? 90);
      if (!finite(angle) || angle < 0 || angle >= 360) throw new Error("Ángulo inválido.");
      if(pending.rangedPhysical && !validArenaPoint(command.predictedCenter)) throw new Error("Marca dónde interceptarás el proyectil.");
      const alignment = deflectionAlignment(pending.trajectory,angle);
      const spatialAlignment = !pending.rangedPhysical || (validArenaPoint(pending.targetCenter) && validArenaPoint(command.predictedCenter) && Math.hypot(pending.targetCenter.x-command.predictedCenter.x,pending.targetCenter.y-command.predictedCenter.y)<=0.09);
      const success = rolls.defense < contestChance(fighter.agility * (0.5+alignment), attacker.strength);
      avoided = success && (pending.rangedPhysical ? spatialAlignment : alignment >= 0.55);
      if (!avoided) damageScale = 0.85;
    }
    if(command.dodgeDirection && defense!=="DODGE")throw new Error("Solo puedes elegir desplazamiento para Esquivar.");
    if(defense==="DODGE"&&avoided&&command.dodgeDirection){
      const direction=command.dodgeDirection;
      if(!["AWAY","TOWARD","WEAPON"].includes(direction))throw new Error("Dirección de esquive inválida.");
      const dropped=activeDroppedWeapon(state,by,command.weaponSlot);
      if(direction==="WEAPON"&&!dropped)throw new Error("No hay arma arrojada hacia la cual esquivar.");
      const target=direction==="WEAPON"?dropped!.positionMeters:attacker.positionMeters;
      const sign=Math.sign(target-fighter.positionMeters)||1;
      const step=Math.min(0.5,Math.abs(target-fighter.positionMeters));
      fighter.positionMeters+=sign*(direction==="AWAY"?-0.5:step);
      clearPhysicalStrokes(state,by);
      if(direction==="WEAPON"&&dropped&&Math.abs(fighter.positionMeters-dropped.positionMeters)<0.2){
        restoreWeapon(state,dropped);
      }
    }
    // No selected dodge means contact is checked against a small base margin,
    // not another invisible full Esquive roll.
    const contact = !avoided && (!pending.beyondEffectiveRange || rolls.hit<=0.65) && (
      // Basic magic preserves its established full-area effect. Projectile
      // placement and hand-drawn melee use the explicit geometric hitbox.
      pending.usesMagic || (pending.rangedPhysical
        ? validArenaPoint(pending.targetCenter) && Math.hypot(
          pending.targetCenter.x-targetHitboxCenter.x,pending.targetCenter.y-targetHitboxCenter.y
        ) <= (pending.attackType==="BLUNT"?0.17:pending.attackType==="CUT"?0.11:0.07)
        : geometricContact(pending.attackType,pending.trajectory,targetHitboxCenter))
    );
    const critical = contact && rolls.critical < clamp(0.05 + attacker.critical / (attacker.critical + fighter.luck + 100)*0.20,0.05,0.25);
    // A free phase-1 magical *basic* strike is intentionally bounded.
    // Full skill damage, mana expenditure and elemental effects belong to phase 2.
    const skill=pending.skill;
    const raw=skill
      ?Math.max(1,Math.round(power*skill.damageMultiplier*(critical?1.5:1)*typeFactor
        -protection*skill.defenseFactor*0.75))
      :pending.usesMagic
        ?Math.max(1,Math.round((3+5*power/(power+protection+20))*(critical?1.5:1)*typeFactor))
        :Math.max(1,Math.round(power*(critical?1.5:1)*typeFactor-protection*0.75));
    const damage = contact ? Math.max(0, Math.round(raw * damageScale * (skill?.finalMultiplier??1))) : 0;
    fighter.hp = Math.max(0, fighter.hp - damage);
    if (contact && damage > 0 && displaced === 0 && !pending.usesMagic)
      displaced = knockbackMeters(attacker.strength, fighter.constitution, fighter.massKg) * (defense === "BLOCK" ? 0.25 : 1);
    if (displaced > 0) {
      if (defense === "REPEL" && damageScale < 1) {
        const sign = Math.sign(attacker.positionMeters - fighter.positionMeters) || 1;
        attacker.positionMeters += sign * displaced;
        // An involuntary displacement also breaks the continuity of a stroke.
        clearPhysicalStrokes(state,pending.by);
      } else {
        const sign = Math.sign(fighter.positionMeters - attacker.positionMeters) || 1;
        fighter.positionMeters += sign * displaced;
        clearPhysicalStrokes(state,by);
      }
    }
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT + attacker.spentTicks,(state.round-1)*LIMIT + fighter.spentTicks);
    addLog(state,{kind:"RESOLVE",tick:state.tick,by:pending.by,against:by,damage,critical,
      contact,knockbackMeters:Math.round(displaced*100)/100,weaponIntegrity:fighter.weaponIntegrity,defense,
      skillId:pending.skill?.id,
      areaCenter:pending.usesMagic||pending.rangedPhysical?pending.targetCenter:undefined,
      rangedPhysical:pending.rangedPhysical,
      predictedCenter:(pending.usesMagic&&defense==="DODGE"||pending.rangedPhysical&&["DODGE","DEFLECT"].includes(defense))?command.predictedCenter:undefined,
      predictionMatched:validArenaPoint(pending.targetCenter)&&validArenaPoint(command.predictedCenter)?Math.hypot(pending.targetCenter.x-command.predictedCenter.x,pending.targetCenter.y-command.predictedCenter.y)<=(pending.rangedPhysical?0.09:0.19):undefined,
      summary:avoided ? fighter.name + (pending.usesMagic?" escapó de la explosión":" evitó el ataque")
        : attacker.name + (pending.usesMagic?" acertó con su explosión mágica a ":" impactó a ") + fighter.name + " (" + damage + " HP)"});
    state.pending = null;
    if (fighter.hp <= 0) {
      state.status = "FINISHED";state.winner = pending.by;
      addLog(state,{kind:"END",tick:state.tick,by:pending.by,against:by,summary:attacker.name+" gana el combate"});
      settleDroppedWeapons(state);
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
    if (!["TOWARD","AWAY","WEAPON"].includes(direction)) throw new Error("Dirección inválida.");
    const dropped=activeDroppedWeapon(state,by,command.weaponSlot);
    if(direction==="WEAPON"&&!dropped)throw new Error("No hay un arma arrojada que recuperar.");
    const target=direction==="WEAPON"?dropped!.positionMeters:rival.positionMeters;
    const sign = Math.sign(target-fighter.positionMeters)||1;
    const magnitude = direction==="AWAY" ? -command.meters : Math.min(command.meters,Math.abs(target-fighter.positionMeters));
    fighter.positionMeters += sign*magnitude;
    let recoveredWeapon:string|undefined;
    if(direction==="WEAPON"&&dropped&&Math.abs(fighter.positionMeters-dropped.positionMeters)<0.2&&restoreWeapon(state,dropped)){
      recoveredWeapon=dropped.weapon.name;
    }
    if(magnitude!==0)clearPhysicalStrokes(state,by);
    spend(fighter,turnTicks(fighter));
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"MOVE",tick:state.tick,by,
      summary:recoveredWeapon?fighter.name+" recuperó "+recoveredWeapon+" tras desplazarse":fighter.name+" se desplazó "+command.meters+" m ("+direction+")"});
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
    const magic=command.usesMagic===true;
    const source=command.attackSource??defaultAttackSource(fighter);
    if(!["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT"].includes(source))throw new Error("Origen de ataque inválido.");
    const selectedWeapon=weaponForSource(fighter,source);
    if(magic&&serverSkillRangeMeters===undefined&&command.attackType!==fighter.attackType)
      throw new Error("La magia básica debe usar el tipo de ataque mágico configurado en la ficha.");
    if(magic&&serverSkillRangeMeters===undefined){
      const mana=state.mana?.[by];
      if(!mana||mana.current<1)throw new Error("Necesitas 1 punto de maná para lanzar magia básica.");
    }
    const thrown=command.throwWeapon===true;
    const ranged=command.rangedPhysical===true||thrown;
    if(thrown&&serverSkillRangeMeters!==undefined)throw new Error("Las habilidades no pueden arrojar armas automáticamente.");
    if(thrown&&(!selectedWeapon?.throwable||!selectedWeapon.throwRangeMeters))throw new Error("El arma equipada no puede arrojarse.");
    if(magic&&ranged)throw new Error("El ataque no puede ser mágico y proyectil físico a la vez.");
    if(!magic&&serverSkillRangeMeters===undefined){
      const weapon=selectedWeapon;
      if(["MAIN_HAND","OFF_HAND"].includes(source)&&!weapon)throw new Error("No tienes un arma equipada en la mano seleccionada.");
      if(ranged&&!thrown&&(!weapon||weapon.mode!=="RANGED"))throw new Error("Necesitas un arma a distancia equipada para disparar.");
      if(!weapon&&command.attackType!=="BLUNT")throw new Error("Sin arma equipada solo puedes golpear con los puños (contundente).");
      if(weapon&&weapon.attackType!==command.attackType)throw new Error("El tipo de ataque debe coincidir con el arma equipada.");
      if(!ranged&&weapon?.mode==="RANGED")throw new Error("Esta arma está configurada para ataques a distancia.");
    }
    if(ranged&&!validArenaPoint(command.areaCenter))throw new Error("Marca el punto de impacto del proyectil.");
    if(!magic&&!ranged) {
      const previous=physicalAttackStart(state,by,source);
      if(previous && Math.hypot(points[0].x-previous.x,points[0].y-previous.y)>0.000001)
        throw new Error("El ataque físico debe comenzar donde terminó el anterior. Muévete para cambiar el punto de inicio.");
    }
    if (magic && !validArenaPoint(command.areaCenter))
      throw new Error("Marca el centro de la explosión mágica en el lienzo.");
    if (Math.abs(fighter.positionMeters-rival.positionMeters)>(serverSkillRangeMeters??(magic?BASIC_MAGIC_RANGE_METERS:effectiveWeaponReachMeters(fighter,thrown,source))))
      throw new Error(magic?"El objetivo está fuera del alcance mágico de 4 m.":"El objetivo está fuera del alcance máximo del ataque.");
    const distanceAtLaunch=Math.abs(fighter.positionMeters-rival.positionMeters);
    const effectiveAtLaunch=selectedWeapon?.effectiveRangeMeters??effectiveWeaponReachMeters(fighter,false,source);
    spend(fighter,turnTicks(fighter,command.attackType));
    if(magic&&serverSkillRangeMeters===undefined)state.mana![by].current-=1;
    if(thrown&&selectedWeapon){
      const slot=source as "MAIN_HAND"|"OFF_HAND";
      state.droppedWeapons??=[];
      state.droppedWeapons.push({owner:by,slot,weapon:{...selectedWeapon},positionMeters:rival.positionMeters});
      if(slot==="MAIN_HAND")fighter.equippedWeapon=undefined;
      else fighter.offhandWeapon=undefined;
      if(state.physicalPathEnds?.[by])delete state.physicalPathEnds[by]![source];
    }
    if(!magic&&!ranged){
      state.physicalPathEnd??={};
      state.physicalPathEnd[by]={...points[points.length-1]};
      state.physicalPathEnds??={};
      state.physicalPathEnds[by]??={};
      state.physicalPathEnds[by]![source]={...points[points.length-1]};
    }
    state.pending = {by,against:other(by),attackType:command.attackType,
      trajectory:points,launchedAtTick:(state.round-1)*LIMIT+fighter.spentTicks,usesMagic:magic,rangedPhysical:ranged,thrownWeapon:thrown,attackSource:source,
      beyondEffectiveRange:!magic&&!thrown&&distanceAtLaunch>effectiveAtLaunch,
      targetCenter:magic||ranged?command.areaCenter:undefined,
      areaHint:magic||ranged?magicImpactZone(command.areaCenter!):undefined};
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    const labels:Record<CombatAttackType,string>={CUT:"corte",BLUNT:"golpe contundente",PIERCE:"perforación"};
    addLog(state,{kind:"ATTACK",tick:state.tick,by,against:other(by),attackType:command.attackType,attackSource:source,manaCost:magic&&serverSkillRangeMeters===undefined?1:undefined,
      summary:magic?fighter.name+" lanzó magia de "+labels[command.attackType]+"; esperando reacción"
        :ranged?fighter.name+" lanzó "+(thrown?"el arma ("+selectedWeapon?.name+") de ":"un proyectil físico de ")+labels[command.attackType]+"; esperando reacción"
        :fighter.name+" atacó con "+(selectedWeapon?.name??(source==="FIST_LEFT"?"puño izquierdo":"puño derecho"))+" ("+labels[command.attackType]+")"+"; esperando reacción"});
  } else throw new Error("Acción inválida o habilidad sin autorización del servidor.");
  state.tick = Math.max(state.tick,(state.round-1)*LIMIT + fighter.spentTicks);
  advanceRoundIfComplete(state);
  return state;
}

/**
 * Executes an ALREADY VALIDATED server-side plan. Never trust client-supplied
 * effects, damage, price, cooldown or targets. All changes are pure; the
 * existing locked combat transaction commits mana, effects and initiative
 * atomically in the combatSession JSON state.
 */
export function applyResolvedCombatSkill(
 original:CombatState,by:Side,plan:CombatSkillPlan,
 aim:{requestId:string;trajectory?:Point[];areaCenter?:Point;attackSource?:PhysicalAttackSource},
 rolls:{hit:number;critical:number;defense:number},
):CombatState {
 if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(aim.requestId))
  throw new Error("Identificador de acción inválido.");
 if(original.processedSkillRequests?.includes(aim.requestId))
  return original;
 if(!canAct(original,by))throw new Error("No puedes lanzar una habilidad fuera de tu iniciativa.");
 const available=original.mana?.[by];
 if(!available||!Number.isFinite(available.current))
  throw new Error("Este encuentro no tiene maná de fase 2; inicia uno nuevo.");
 if(available.current<plan.cost)
  throw new Error("Maná insuficiente para esta habilidad.");
 const key=String(plan.id);
 const nextAllowed=original.skillCooldowns?.[by]?.[key]??0;
 if(nextAllowed===-1 || nextAllowed>original.round)
  throw new Error(nextAllowed===-1?"Esta habilidad solo se usa una vez por combate.":
    "Habilidad en cooldown hasta el turno "+nextAllowed+".");
 let next:CombatState;
 if(plan.category==="OFFENSE") {
  if(!plan.attackType)throw new Error("La habilidad no tiene tipo de ataque.");
  next=applyCombatCommand(original,by,{
   kind:"ATTACK",attackType:plan.attackType,usesMagic:plan.usesMagic,
   trajectory:aim.trajectory,areaCenter:aim.areaCenter,attackSource:aim.attackSource,
  },rolls,plan.rangeMeters);
  if(!next.pending)throw new Error("No se pudo preparar el ataque de habilidad.");
  next.pending.skill={
   id:plan.id,name:plan.name,damageMultiplier:plan.damageMultiplier,
   defenseFactor:plan.defenseFactor,finalMultiplier:plan.finalMultiplier,
  };
  const event=next.log.at(-1);
  if(event){event.skillId=plan.id;event.manaCost=plan.cost;
   event.summary=next.actors[by].name+" lanzó "+plan.name+"; esperando reacción";}
 }else{
  next=structuredClone(original);
  const actor=next.actors[by];
  actor.hp=Math.min(actor.maxHp,Math.max(0,actor.hp+plan.healing));
  next.skillBonuses??=[];
  for(const bonus of plan.bonuses){
   actor[bonus.stat]+=bonus.value;
   next.skillBonuses.push({...bonus,by,skillId:plan.id,
      expiresAtRound:next.round+plan.durationTurns});
  }
  spend(actor,turnTicks(actor));
  next.tick=Math.max(next.tick,(next.round-1)*LIMIT+actor.spentTicks);
  addLog(next,{kind:"SKILL",tick:next.tick,by,skillId:plan.id,manaCost:plan.cost,
   summary:actor.name+" usó "+plan.name+(plan.healing?" y recuperó hasta "+plan.healing+" HP":"")});
  advanceRoundIfComplete(next);
 }
 next.mana![by].current-=plan.cost;
 next.skillCooldowns??={};
 next.skillCooldowns[by]??={};
 next.skillCooldowns[by]![key]=plan.oncePerCombat?-1:
   (plan.cooldownRounds>0?original.round+plan.cooldownRounds+1:0);
 next.processedSkillRequests=[...(next.processedSkillRequests??[]),aim.requestId].slice(-100);
 return next;
}
