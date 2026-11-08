import { calculateActionTicks, COMBAT_TICKS_PER_TURN } from "./ticks.ts";
import type { CombatAttackType } from "./ticks";
import type { CombatDefenseType } from "./matchup-types.ts";
import type { CombatSkillPlan,CombatBuffStat } from "./skill-casting.ts";
import { geometricContact } from "./geometry.ts";
import { COMBAT_NARRATIVE_VERSION, narrateCombat } from "./narration.ts";
import { racialDamageFactor, type DamageTakenFactors } from "./innate-traits.ts";
import { executeMicroEvent, emptyMicroState, validateEffectContainers, type EffectContainer, type MicroState } from "../effects/micro-modules.ts";
import {calculateModularVariableResistance} from "../effects/legacy-modular-shadow.ts";
import {validateConstructionPlacement,resolveConstructionForm,constructionInAreaFootprint,firstMirrorAlongMagicRay,type CombatConstruction} from "./constructs.ts";
import { BASIC_MAGIC_AREA_RADIUS, BASIC_MAGIC_RANGE_METERS, guessedMagicCenter, magicImpactZone, validArenaPoint } from "./magic-area.ts";
import {attackAreaHits,validateAreaDirection,isOrientedCombatArea,AREA_CANVAS_METERS,type CombatAttackArea} from "./skill-area.ts";
import type {CombatConsumable} from "../items/combat-consumables.ts";
import {calculateMaterialBlockWear} from "./material-durability.ts";
import {combatWeaponOperational} from "./weapon-readiness.ts";
import {summonStat,resolveSummonStat,type CombatSummon,type SummonContactEffect} from "./summons.ts";
import {activeChaosField,distortChaosMove} from "./chaos-fusion.ts";
import {creditCombatCharge,ensureCombatChargePool,spendCombatCharges} from "./charge-pools.ts";
import {applySummonStatus,invertSummonStatus,expireSummonStatuses,
 isDebuffStatus,resolveStatusStat,type SummonStatus} from "./summon-status.ts";
import {evaluateEquippedItemAutoRepair,shouldAutoRepairAtRound,
 type AutoRepairItemEffect} from "../items/auto-repair.ts";
import {equipmentWearFromHit} from "../items/equipped-wear.ts";
import type {CombatWearable} from "../items/combat-wearables.ts";
import {assertMovementClear,blockingMovement,coversAlongStroke,measuredBlock,validatePhysicalCollider} from "./physical-obstacles.ts";
import {fieldDistance,fieldPosition,moveFighterOnField,pointFromFieldView,
 validatePlanarMove} from "./field-plane.ts";

export type Side = "PLAYER" | "NPC";
export type DefenseChoice = "DODGE" | "BLOCK" | "ENDURE" | "REPEL" | "DEFLECT" | "MAGIC_FIELD" | "CONSTRUCTION" | "COUNTER" | "NONE";
export type Point = { x: number; y: number };
export type PhysicalAttackSource = "MAIN_HAND" | "OFF_HAND" | "FIST_RIGHT" | "FIST_LEFT" | "KICK";
export type CombatWeapon = {name:string;attackType:CombatAttackType;mode:"MELEE"|"RANGED";effectiveRangeMeters:number;maximumRangeMeters?:number;throwable?:boolean;throwRangeMeters?:number;itemId?:number;characterItemId?:number;durability?:number;
  /** From the server-selected item's material, not supplied by an attacker. */
  materialPerkBonus?:{perkId:number;attackBonus:number};
  /** Catalog snapshot: 100 is neutral; values above 100 reduce BLOCK wear. */
  materialPhysicalResistance?:number;
  materialName?:string;
  /** Server-compiled item catalog effect snapshot (never sent by command). */
  autoRepair?:AutoRepairItemEffect;
  lastAutoRepairRound?:number;
  /** Invalid staff-configured formulas must never block the whole encounter. */
  autoRepairDisabled?:boolean;
};
export type CombatFighter = {
  characterId: number | null; name: string; hp: number; maxHp: number;
  agility: number; speedValue?: number; strength: number; constitution: number; precision: number;
  dodge: number; physicalAttack: number; physicalDefense: number;
  magicAttack: number; magicDefense: number; critical: number; luck: number;
  race: number; massKg: number; positionMeters: number; attackType: CombatAttackType;
  heightMeters?: number; unarmedReachMeters?: number;
  fieldPosition?:Point;
  equippedWeapon?: CombatWeapon;
  offhandWeapon?: CombatWeapon;
  /** Real equipped armor / accessory copies from the server-side duel snapshot. */
  equippedWearables?:CombatWearable[];
  defenseType: CombatDefenseType; magicFieldType?: CombatDefenseType;
  magicFieldDescription?: string | null; damageTakenFactors?:DamageTakenFactors; perkIds?:number[]; weaponIntegrity: number;
  spentTicks: number; spentAp: number;
};
export type PendingAttack = {
  by: Side; against: Side; attackType: CombatAttackType;
  trajectory: Point[]; launchedAtTick: number; usesMagic: boolean;
  rangedPhysical?: boolean; thrownWeapon?:boolean; beyondEffectiveRange?:boolean;
  attackSource?: PhysicalAttackSource;
  materialPerkBonus?:{perkId:number;attackBonus:number};
  /** Hidden from client while pending; attacker-selected basic magic blast. */
  targetCenter?: Point;
  /** Coarse, public four-cell telegraph; never reveals the exact impact point. */
  areaHint?: string;
  /** Server-derived configured area. Undefined keeps historic targeting. */
  attackArea?:CombatAttackArea;
  /** Private until resolved for rectangular strips, cones and annular sweeps. */
  areaAngleDegrees?:number;
  planarMove?:Point;
  movementOrder?:"BEFORE"|"AFTER";
  skill?: {id:number;name:string;damageMultiplier:number;defenseFactor:number;finalMultiplier:number;damageElement?:string};
  /** Autonomous attack from a placed mirror; does not charge an extra action. */
  mirrorId?:string; mirrorAuto?:boolean;
  /** Summoned strike uses entity stats, but owner PA/ticks. */
  summonId?:string;
  chosenSummonStat?:string;
  chosenSummonStatusId?:string;
  /** Server-only horizontal path of a directed magical single-target strike.
   * Captured on launch, before dodge/movement. Never sent to the client.
   * Undefined for instant/area/basic spells or historical pending attacks.
   */
  directedMagicRay?:{from:Point;to:Point};
  /** Only user-specified vertical strokes can authorize 3D cover tests. */
  explicitTrajectory?:boolean;
};
export type CombatLog = {
  kind: string; tick: number; by: Side; against?: Side; summary: string;
  damage?: number; critical?: boolean; contact?: boolean;
  /** Mark the defender's retaliatory strike; it has no separate dodge prompt. */
  simultaneousCounter?:boolean;
  /** The amount prevented specifically by the physical/magical defense stat. */
  mitigatedByResistance?:number;
  materialAttackBonus?:number;
  knockbackMeters?: number; weaponIntegrity?: number; defense?: DefenseChoice;
  attackType?: CombatAttackType; rangedPhysical?: boolean; predictionMatched?: boolean;
  attackSource?: PhysicalAttackSource;
  areaCenter?: Point; predictedCenter?: Point;
  /** Disclosed only after resolution, for the area diagram/chronicle. */
  attackArea?:CombatAttackArea;
  areaAngleDegrees?:number;
  skillId?: number; manaCost?: number;
  /** Narration metadata; optional for encounters created before this feature. */
  usesMagic?:boolean; thrownWeapon?:boolean; weaponName?:string;
  skillName?:string; healingPoints?:number;
  /** Rayo emitido por un espejo, no una explosión mágica genérica. */
  mirrorShot?:boolean;
  /** Visible only after resolution; canvas origin of a mirror ray. */
  mirrorOrigin?:Point;
  karmaSpent?:number; karmaAllocation?:Record<string,number>; constructionId?:string;
  summonId?:string;
  movementDirection?:"TOWARD"|"AWAY"|"WEAPON"|"VECTOR"; moveMeters?:number;
  fieldPosition?:Point;
};
export type CombatState = {
  /** NPC-only randomized loadout: persistent per encounter, never written to a character. */
  trainingNpc?: {difficulty:"BASIC"|"INTERMEDIATE"|"ADVANCED"|"ENDURANCE"|"AGGRESSIVE";
    race:{id:number;name:string};
    racialPerks?:Array<{id:number;name:string;mechanical:boolean}>;
    extraPerks?:Array<{id:number;name:string;mechanical?:boolean}>;
    /** Compatibility with early PR #125 preview encounters. */
    perks?:Array<{id:number;name:string}>;skills:CombatSkillPlan[]};
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
  processedKarmaRequests?: string[];
  /** Request ledger for MOVE/ATTACK/DEFEND/WAIT/ADVANCE, preserved for the
   * whole encounter so a lost HTTP response cannot spend resources twice.
   * Optional for historical combatV1 sessions.
   */
  processedActionRequests?: Array<{id:string;side:Side;signature:string}>;
  /** New encounters track durability separately for both equipped hands.
   * Older combat JSON used one fighter.weaponIntegrity; upgrade on first action.
   */
  perHandWeaponDurability?:boolean;
  /** Self-repair events for the current new round only. The DB resolver
   * combines these positive gains with any same-action weapon wear. */
  itemRepairsThisRound?:Array<{by:Side;characterItemId:number;restored:number;round:number}>;
  /** Encounter inventory. Real character copies are spent in the session transaction. */
  consumables?:Partial<Record<Side,CombatConsumable[]>>;
  processedItemRequests?:string[];
  karmaBoosts?: Partial<Record<Side,Record<string,number>>>;
  karmaBoostDeltas?: Partial<Record<Side,Record<string,number>>>;
  constructions?: CombatConstruction[];
  /** Persistent, targetable creatures for the encounter. */
  summons?: CombatSummon[];
  /** Charges belong to the combatant, not to a disappearing summon. */
  combatCharges?: Partial<Record<Side,Record<string,number>>>;
  /** Statuses created by physical entity contact; persisted in combatV1. */
  summonStatuses?: SummonStatus[];
  /** Opt-in modules persist with combatV1. Preexisting encounters omit this property. */
  microEffects?: { definitions:Partial<Record<Side,EffectContainer[]>>; state:MicroState; sequence:number };
  /** Ordered rays to resolve on the start of a new round. */
  mirrorRayQueue?: string[];
  droppedWeapons?: Array<{owner:Side;weapon:CombatWeapon;slot?:"MAIN_HAND"|"OFF_HAND";positionMeters:number}>;
  /** All chronological events needed to narrate a long fight (not just the last 100 on-screen entries). */
  narrativeHistory?: CombatLog[];
  /** Persisted final chronicle. Created exactly once when the fight ends. */
  narrativeText?: string;
  narrativeVersion?:number;
  narrativePartial?:boolean;
  pending: PendingAttack | null; log: CombatLog[];
};
export type CombatCommand =
  | { kind: "MOVE"; meters: number; direction?: "TOWARD" | "AWAY" | "WEAPON" | "VECTOR"; planarMove?:Point; weaponSlot?:"MAIN_HAND"|"OFF_HAND"; requestId?:string }
  | { kind: "WAIT";requestId?:string }
  | { kind:"BOOST_KARMA";requestId:string;allocation:Record<string,number> }
  | { kind:"USE_ITEM";itemId:number;characterItemId?:number;requestId:string }
  | { kind: "COMMAND_SUMMON";requestId?:string;summonId:string;
       chosenStat?:string;chosenStatusId?:string;
       order:"ACT"|"MOVE"|"ATTACK"|"CHANGE_BEHAVIOR";planarMove?:Point;newBehavior?:"FOLLOW"|"ATTACK"|"PROTECT"|"HOLD"|"MANUAL" }
  | { kind: "ATTACK"; requestId?:string; targetSummonId?:string; attackType: CombatAttackType; planarMove?:Point; movementOrder?:"BEFORE"|"AFTER"; trajectory?: Point[]; usesMagic?: boolean; rangedPhysical?: boolean; throwWeapon?:boolean; attackSource?: PhysicalAttackSource; areaCenter?: Point; areaAngleDegrees?:number; targetConstructionId?:string }
  | { kind: "DEFEND"; requestId?:string; defense: DefenseChoice; planarMove?:Point; defenseAngle?: number; predictedCenter?: Point; constructionId?:string; dodgeDirection?:"AWAY"|"TOWARD"|"WEAPON"; weaponSlot?:"MAIN_HAND"|"OFF_HAND"; counterMagic?:boolean }
  | { kind: "CAST_SKILL";skillId:number;requestId:string;chargesToSpend?:number;planarMove?:Point;movementOrder?:"BEFORE"|"AFTER";constructionFieldPoint?:Point;constructionHeightMeters?:number;constructionFootprintRadiusMeters?:number;constructionSolidHeightMeters?:number;trajectory?:Point[];areaCenter?:Point;areaAngleDegrees?:number;attackSource?:PhysicalAttackSource;constructionForm?:"FIELD"|"BLOCK"|"DECOR";constructionLabel?:string;targetConstructionId?:string;targetSummonId?:string };

const SIDES: Side[] = ["PLAYER", "NPC"];
const LIMIT = COMBAT_TICKS_PER_TURN;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const other = (side: Side): Side => side === "PLAYER" ? "NPC" : "PLAYER";
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
const normalize = (n: number) => Math.max(0, finite(n) ? n : 0);
/** Only the server supplies resolved deltas and charges the real karma wallet in
 * the same transaction as the updated encounter state. One activation is one
 * action, irrespective of the amount of karma or number of base stats.
 */
export function applyResolvedKarmaBoost(
 original:CombatState,by:Side,requestId:string,allocation:Record<string,number>,
 cost:number,deltas:Record<string,number>,
):CombatState {
 if(original.processedKarmaRequests?.includes(requestId))return original;
 if(original.status!=="ACTIVE"||!canAct(original,by))throw new Error("No tienes la iniciativa para aumentar estadísticas.");
 if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(requestId))throw new Error("Identificador de boost inválido.");
 const points=Object.values(allocation).reduce((sum,n)=>sum+n,0);
 if(!Number.isSafeInteger(points)||points<=0||cost!==points*2)throw new Error("Coste de karma inválido.");
 const state=structuredClone(original),actor=state.actors[by];
 for(const [key,value] of Object.entries(deltas)) {
  if(!Number.isFinite(value))throw new Error("Delta estadístico inválido.");
  if(key==="manaMax"){
   if(state.mana?.[by])state.mana[by].max=Math.max(state.mana[by].current,state.mana[by].max+value);
  } else if(key in actor && typeof (actor as unknown as Record<string,unknown>)[key]==="number"){
   const fields=actor as unknown as Record<string,number>;
   fields[key]=Math.max(0,fields[key]+value);
   if(key==="maxHp")actor.hp=Math.min(actor.hp,actor.maxHp);
  }
 }
 state.karmaBoosts??={};state.karmaBoosts[by]??={};
 for(const [key,value] of Object.entries(allocation))state.karmaBoosts[by]![key]=(state.karmaBoosts[by]![key]??0)+value;
 state.karmaBoostDeltas??={};state.karmaBoostDeltas[by]??={};
 for(const [key,value] of Object.entries(deltas))state.karmaBoostDeltas[by]![key]=(state.karmaBoostDeltas[by]![key]??0)+value;
 state.processedKarmaRequests??=[];state.processedKarmaRequests.push(requestId);
 spend(actor,turnTicks(actor)); // exactly one PA, independently of allocated points
 state.tick=Math.max(state.tick,(state.round-1)*LIMIT+actor.spentTicks);
 addLog(state,{kind:"KARMA",tick:state.tick,by,karmaSpent:cost,karmaAllocation:{...allocation},
  summary:actor.name+" gastó "+cost+" karma para aumentar "+Object.entries(allocation).map(([key,n])=>key+" +"+n).join(", ")});
 advanceRoundIfComplete(state);
 return state;
}
/** One real action and one consumable unit. The amount is never supplied by the
 * browser. The route verifies the item recipe and atomically debits the real
 * characterItem stack in the same DB transaction as the encounter.
 */
export function applyResolvedCombatConsumable(
 original:CombatState,by:Side,item:CombatConsumable,requestId:string,
):CombatState {
 if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(requestId))
  throw new Error("Identificador de consumo inválido.");
 if(original.processedItemRequests?.includes(requestId))return original;
 if(original.status!=="ACTIVE"||!canAct(original,by))
  throw new Error("Espera tu iniciativa para utilizar consumibles.");
 const state=structuredClone(original);
 const items=state.consumables?.[by]??[];
 const selected=items.find(x=>x.itemId===item.itemId&&
  x.characterItemId===item.characterItemId&&x.quantity>0);
 if(!selected||selected.action!==item.action||selected.amount!==item.amount)
  throw new Error("No tienes disponible ese consumible en este encuentro.");
 const fighter=state.actors[by],mana=state.mana?.[by];
 if(selected.action==="HEAL_HP") {
  if(fighter.hp>=fighter.maxHp)throw new Error("Ya tienes todos tus HP.");
 }else if(selected.action==="RESTORE_MANA"){
  if(!mana||mana.current>=mana.max)throw new Error("Ya tienes todo tu maná.");
 }else throw new Error("Este consumible no se puede usar en combate.");
 const before=selected.action==="HEAL_HP"?fighter.hp:mana!.current;
 const after=selected.action==="HEAL_HP"?Math.min(fighter.maxHp,before+selected.amount):
  Math.min(mana!.max,before+selected.amount);
 const restored=after-before;
 if(selected.action==="HEAL_HP")fighter.hp=after;
 else mana!.current=after;
 selected.quantity--;
 spend(fighter,turnTicks(fighter)); // paid, neutral action: no weapon speed modifier
 state.tick=Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
 state.processedItemRequests=[...(state.processedItemRequests??[]),requestId].slice(-100);
 addLog(state,{kind:"ITEM",tick:state.tick,by,
  summary:fighter.name+" utilizó "+selected.name+" y recuperó "+restored+
   (selected.action==="HEAL_HP"?" HP":" de maná")});
 advanceRoundIfComplete(state);
 return state;
}

function clearKarmaBoostsAtCombatEnd(state:CombatState){
 for(const side of SIDES) {
  const actor=state.actors[side];
  for(const [key,amount] of Object.entries(state.karmaBoostDeltas?.[side]??{})) {
   if(key==="manaMax") {
    if(state.mana?.[side])state.mana[side].max=Math.max(0,state.mana[side].max-amount);
   }else if(key in actor&&typeof (actor as unknown as Record<string,unknown>)[key]==="number"){
    const fields=actor as unknown as Record<string,number>;
    fields[key]=Math.max(0,fields[key]-amount);
   }
  }
  actor.hp=Math.min(actor.hp,actor.maxHp);
  if(state.mana?.[side])state.mana[side].current=Math.min(state.mana[side].current,state.mana[side].max);
 }
 state.karmaBoosts={};state.karmaBoostDeltas={};
}
/** The duel canvas represents the defender at its normalized center.
 * Its world-space separation is checked independently in meters. */
export const targetHitboxCenter: Point = {x:0.5,y:0.5};
export function defaultAttackSource(f:CombatFighter):PhysicalAttackSource {
 return combatWeaponOperational(f.equippedWeapon)?"MAIN_HAND":
  combatWeaponOperational(f.offhandWeapon)?"OFF_HAND":"FIST_RIGHT";
}
export function weaponForSource(f:CombatFighter,source:PhysicalAttackSource):CombatWeapon|undefined {
 return source==="MAIN_HAND"?f.equippedWeapon:source==="OFF_HAND"?f.offhandWeapon:undefined;
}
export function effectiveWeaponReachMeters(f:CombatFighter, thrown=false, source:PhysicalAttackSource=defaultAttackSource(f)):number {
 const weapon=weaponForSource(f,source);
 if(weapon&&!combatWeaponOperational(weapon))return 0;
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
const addLog = (state: CombatState, entry: CombatLog) => {
  state.narrativeHistory ??= state.log.slice(); // Backfill legacy fights when possible.
  state.narrativeHistory.push(entry);
  state.log.push(entry);
  state.log = state.log.slice(-100);
};
/**
 * Server-only opt-in for already-authorized encounter modules.
 * No API accepts user-supplied module definitions; pricing/approval integration
 * is deliberately deferred. Only supported phases can be installed.
 */
export function installEncounterMicroEffects(original:CombatState,side:Side,definitions:readonly EffectContainer[]):CombatState {
  const error=validateEffectContainers(definitions);
  if(error)throw new Error(error);
  for(const effect of definitions){
    const allowed=effect.trigger==="DAMAGE_RESOLVED"?["STORE"]:
      effect.trigger==="TURN_START"?["HEAL"]:
      effect.trigger==="PASSIVE"?["MODIFIER"]:[];
    if(!allowed.length || effect.steps.some(step=>!allowed.includes(step.kind)
      || (effect.trigger==="PASSIVE" && (step.kind!=="MODIFIER" || step.stat!=="RESISTANCE"))))
      throw new Error("Micromódulo de fase de combate no implementada.");
  }
  const next=structuredClone(original);
  next.microEffects??={definitions:{},state:emptyMicroState(),sequence:0};
  next.microEffects.definitions[side]=structuredClone(definitions) as EffectContainer[];
  return next;
}
const microActorId=(side:Side)=>side==="PLAYER"?1:2;
function microStats(fighter:CombatFighter):Record<string,number>{
  return {HP:fighter.hp,MAX_HP:fighter.maxHp,STR:fighter.strength,
    PHYSICAL_DEFENSE:fighter.physicalDefense,MAGIC_DEFENSE:fighter.magicDefense};
}
function microForSide(state:CombatState,side:Side){
  return state.microEffects?.definitions[side]??[];
}
function microResistanceMultiplier(state:CombatState,side:Side):number {
  const definitions=microForSide(state,side);
  if(!definitions.some(e=>e.trigger==="PASSIVE"))return 1;
  const result=executeMicroEvent(state.microEffects!.state,definitions,{
    eventId:"PassiveDefense",ownerId:microActorId(side),trigger:"PASSIVE",
    stats:microStats(state.actors[side]),
  });
  let factor=1;
  for(const intent of result.intents){
    if(intent.kind!=="MODIFIER"||intent.stat!=="RESISTANCE")
      throw new Error("Micromódulo pasivo sin resolutor defensivo.");
    factor*=intent.multiplier;
  }
  if(!Number.isFinite(factor)||factor<0||factor>100)
    throw new Error("Multiplicador de resistencia fuera de límites.");
  return factor;
}
function dispatchCombatMicroEvent(state:CombatState,side:Side,
  trigger:"DAMAGE_RESOLVED"|"TURN_START",event?:Record<string,number>):void{
  const runtime=state.microEffects;
  const definitions=microForSide(state,side);
  if(!runtime || !definitions.some(e=>e.trigger===trigger))return;
  // Sequence lives inside the existing locked session transaction.
  if(!Number.isSafeInteger(runtime.sequence)||runtime.sequence<0||runtime.sequence>=1_000_000_000)
    throw new Error("Secuencia de micromódulos inválida.");
  const eventId="CombatEvent"+(++runtime.sequence);
  const result=executeMicroEvent(runtime.state,definitions,{
    eventId,ownerId:microActorId(side),trigger,
    stats:microStats(state.actors[side]),event,
  });
  for(const intent of result.intents){
    if(trigger!=="TURN_START" || intent.kind!=="HEAL")
      throw new Error("Micromódulo sin resolutor de combate autorizado.");
    if(intent.applied>0){
      state.actors[side].hp=result.hp;
      addLog(state,{kind:"REGEN",tick:state.tick,by:side,healingPoints:intent.applied,
        summary:state.actors[side].name+" regeneró "+intent.applied+" HP al comenzar el turno"});
    }
  }
  runtime.state=result.state;
}

/** Item-bound repair runs only when the authoritative encounter advances to
 * a new full round. It consumes encounter mana (not persistent sheet mana),
 * never AP/ticks, and repairs ONLY items still in an equipped slot.
 * This keeps the existing weapon contract while extending to wearables.
 */
export function applyWeaponSelfRepairAtRoundStart(state:CombatState,side:Side):void{
  if(state.status!=="ACTIVE")return;
  const fighter=state.actors[side];
  const mana=state.mana?.[side];
  if(!mana||!Number.isSafeInteger(mana.current))return;
  const seen=new Set<number>();
  for(const weapon of [fighter.equippedWeapon,fighter.offhandWeapon,
    ...(fighter.equippedWearables??[])]){
    const rule=weapon?.autoRepair;
    const durability=weapon?.durability;
    if(!weapon||!rule||!weapon.characterItemId||
      typeof durability!=="number"||!Number.isSafeInteger(durability))
      continue;
    const characterItemId=weapon.characterItemId;
    if(seen.has(characterItemId))continue; // no duplicate inventory copy
    seen.add(characterItemId);
    if(durability<0||durability>=100||weapon.autoRepairDisabled||
      !shouldAutoRepairAtRound(state.round,rule.intervalTurns)||
      weapon.lastAutoRepairRound===state.round||
      !Number.isSafeInteger(rule.manaCost)||rule.manaCost<1||
      mana.current<rule.manaCost)continue;
    const stats={
      ...microStats(fighter),
      AGI:fighter.agility,CON:fighter.constitution,
      PHYSICAL_ATTACK:fighter.physicalAttack,MAGIC_ATTACK:fighter.magicAttack,
      PRECISION:fighter.precision,
      strength:fighter.strength,agility:fighter.agility,
      constitution:fighter.constitution,
      physicalAttack:fighter.physicalAttack,magicAttack:fighter.magicAttack,
      physicalDefense:fighter.physicalDefense,magicDefense:fighter.magicDefense,
      precision:fighter.precision,
    };
    const opponent=state.actors[other(side)];
    const opponentStats={
      ...microStats(opponent),AGI:opponent.agility,CON:opponent.constitution,
      strength:opponent.strength,agility:opponent.agility,
      magicDefense:opponent.magicDefense,
    };
    // A staff-configured formula may reference a statistic disabled in the
    // current character catalog. Never trap both fighters at round rollover.
    let calculated:ReturnType<typeof evaluateEquippedItemAutoRepair>;
    try{
      calculated=evaluateEquippedItemAutoRepair(rule,{
        characterItemId,durability,
      },stats,"itemType" in weapon?weapon.itemType:"WEAPON",
       {USER:stats,OPPONENT:opponentStats});
    }catch{
      weapon.autoRepairDisabled=true;
      addLog(state,{kind:"WEAPON_REPAIR_SKIP",tick:state.tick,by:side,
        weaponName:weapon.name,
        summary:weapon.name+" no pudo autorrepararse por una configuración incompatible."});
      continue;
    }
    if(calculated.restored<=0)continue;
    mana.current-=rule.manaCost;
    weapon.durability=calculated.after;
    weapon.lastAutoRepairRound=state.round;
    if(fighter.equippedWeapon===weapon)fighter.weaponIntegrity=calculated.after;
    state.itemRepairsThisRound??=[];
    state.itemRepairsThisRound.push({
      by:side,characterItemId,restored:calculated.restored,round:state.round,
    });
    addLog(state,{kind:"itemType" in weapon?"EQUIPMENT_REPAIR":"WEAPON_REPAIR",tick:state.tick,by:side,
      weaponName:weapon.name,weaponIntegrity:calculated.after,manaCost:rule.manaCost,
      summary:weapon.name+" restauró "+calculated.restored+
        " de durabilidad al comenzar el turno; consumió "+rule.manaCost+" maná."});
  }
}

/** An opt-in, non-defensive equipment wear event triggered AFTER resolving
 * real HP damage. A miss, dodge or fully absorbed attack wears nothing.
 * Wearable copies are independent: damage does not magically distribute to
 * arbitrary inventory objects. Only equipped and configured pieces react.
 */
export function applyWearableOnConfirmedHpHit(
 state:CombatState,defender:Side,appliedHpDamage:number,magic:boolean
):void{
 if(state.status!=="ACTIVE"||!Number.isSafeInteger(appliedHpDamage)||appliedHpDamage<=0)return;
 const fighter=state.actors[defender];
 const seen=new Set<number>();
 for(const item of fighter.equippedWearables??[]){
  if(seen.has(item.characterItemId))continue;
  seen.add(item.characterItemId);
  if(!item.wearOnHit||item.durability<=0)continue;
  const wear=equipmentWearFromHit(item.durability,appliedHpDamage,magic,item.wearOnHit);
  if(!wear)continue;
  item.durability-=wear;
  addLog(state,{kind:"EQUIPMENT_WEAR",tick:state.tick,by:defender,
   weaponName:item.name,weaponIntegrity:item.durability,
   summary:item.name+" perdió "+wear+" de durabilidad tras recibir "+appliedHpDamage+" HP de daño."});
 }
}

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
    physicalPathEnd:{},physicalPathEnds:{},constructions:[],summons:[],summonStatuses:[],combatCharges:{PLAYER:{},NPC:{}},mirrorRayQueue:[],karmaBoosts:{},karmaBoostDeltas:{},consumables:{},processedItemRequests:[],
    processedKarmaRequests:[],perHandWeaponDurability:true,narrativeHistory:[],pending:null,log:[]};
}
export const effectiveCombatSpeed = (f: CombatFighter) =>
  Math.max(1, f.speedValue ?? f.agility);
/** Attack-type speed modifiers represent handling a weapon, not dealing a
 * certain kind of damage. Callers must pass attackType only for weapon strikes.
 * Unarmed attacks, kicks and magic always use the neutral action tempo.
 */
export function turnTicks(f: CombatFighter, attackType?: CombatAttackType) {
  const modifier = attackType === "BLUNT" ? 1.15 : attackType === "PIERCE" ? 0.85 : 1;
  return calculateActionTicks(effectiveCombatSpeed(f), modifier);
}
/** A combined movement and action use one overlapping temporal window,
 * but each constituent still costs its own action point. */
export function compositeActionTicks(f: CombatFighter, attackType?: CombatAttackType) {
  // Single actions already saturate the 100-tick round rather than refusing
  // slow attacks. Composites follow the same rule while spending exactly 2 PA.
  return Math.min(LIMIT,Math.max(turnTicks(f), turnTicks(f, attackType)));
}
export function remainingAp(f: CombatFighter) {
  return Math.max(0, actionPoints(f.constitution) - f.spentAp);
}
/** An action may begin while any tick remains. Exactly like individual
 * attacks, a composite may finish at the 100-tick boundary even when its
 * nominal duration exceeds the remaining ticks (no tick carryover).
 * It consumes 2 PA, but only the slower component's temporal window.
 */
export function canStartComposite(f: CombatFighter): boolean {
  return remainingAp(f)>=2 && f.spentTicks<LIMIT;
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
/** A composed movement+action pays 2 PA, occupying one temporal window.
 * The normal spend() saturates ticks at 100. Do not require a whole unused
 * window: a single attack also remains legal when only e.g. 19 ticks remain.
 * For AFTER, the movement is applied only after resolving the defense.
 */
function applyCompositeStep(state:CombatState,by:Side,requested:Point,order:"BEFORE"|"AFTER"="BEFORE",actionTicks?:number){
 const fighter=state.actors[by],vector=validatePlanarMove(requested);
 if(remainingAp(fighter)<2)throw new Error("Moverse y actuar a la vez requiere 2 PA.");
 if(fighter.spentTicks>=LIMIT)
  throw new Error("Ya agotaste los 100 ticks de este turno.");
 // The second spend() below charges the attack's incremental ticks over
 // the movement, never a second complete temporal window.
 spend(fighter,turnTicks(fighter));
 if(order==="BEFORE")finishCompositeStep(state,by,vector);
}
/** Apply an already paid and validated move, without charging a third PA. */
function finishCompositeStep(state:CombatState,by:Side,vector:Point){
 const fighter=state.actors[by];
 const from=fieldPosition(fighter),to={x:from.x+vector.x,y:from.y+vector.y};
 assertMovementClear(state.constructions,from,to);
 moveFighterOnField(fighter,vector);
 clearPhysicalStrokes(state,by);
 addLog(state,{kind:"POSITION",tick:(state.round-1)*LIMIT+fighter.spentTicks,by,
  moveMeters:Math.round(Math.hypot(vector.x,vector.y)*100)/100,fieldPosition:{...fieldPosition(fighter)},
  summary:fighter.name+" se desplazó "+Math.hypot(vector.x,vector.y).toFixed(2)+" m como parte de su acción"});
}
/** Involuntary knockback must update the same 2D ground position shown in
 * the horizontal panel. On legacy one-dimensional encounters this reduces
 * exactly to the old signed X movement. */
function pushAwayOnField(state:CombatState,mover:CombatFighter,reference:CombatFighter,meters:number):number{
 const a=fieldPosition(mover),b=fieldPosition(reference);
 const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
 const sign=d>1e-9?{x:dx/d,y:dy/d}:{x:1,y:0};
 const destination={x:a.x+sign.x*meters,y:a.y+sign.y*meters};
 const collision=blockingMovement(state.constructions,a,destination);
 // Forced knockback stops at the measured wall, without cancelling the hit
 // or rolling back the whole combat transaction. Voluntary movement rejects.
 const actual=collision?Math.max(0,meters*collision.t-1e-4):meters;
 moveFighterOnField(mover,{x:sign.x*actual,y:sign.y*actual});
 return actual;
}
function lastInitiativeSide(state: CombatState): Side | null {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const {kind, by} = state.log[i];
    if (kind === "ROUND") break;
    if (kind === "ATTACK" || kind === "MOVE" || kind === "WAIT" || kind === "SKILL" || kind==="KARMA" || kind==="ITEM" || kind==="SUMMON") return by;
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
/** The aiming canvas (0..1) is not a meter-based map. At invocation a mirror
 * is anchored at the targeted fighter's longitudinal world position. This
 * origin stays fixed when either combatant moves. Older encounters fall back
 * to the caster's position, preserving the previous range behaviour.
 */
export function mirrorRayDistanceMeters(state:CombatState,mirror:CombatConstruction):number {
 if(mirror.fieldPosition){
  const target=fieldPosition(state.actors[other(mirror.owner)]);
  return Math.hypot(mirror.fieldPosition.x-target.x,mirror.fieldPosition.y-target.y);
 }
 const stored=mirror.positionMeters;
 const origin=typeof stored==="number"&&Number.isFinite(stored)
  ?stored:state.actors[mirror.owner].positionMeters;
 return Math.abs(origin-state.actors[other(mirror.owner)].positionMeters);
}
/** Both initial and recurring rays originate at the placed mirror, aimed at
 * the opponent's center in the shared defender-facing arena. */
function mirrorRayTrajectory(mirror:CombatConstruction):Point[] {
 return [{...mirror.center},{...targetHitboxCenter}];
}
/** Auto rays are serialized through the same pending-defense workflow.
 * They are emitted only at a new round (never during the casting round) and
 * cost neither the summoner additional mana nor an additional PA.
 */
function beginNextMirrorRay(state:CombatState) {
 if(state.status!=="ACTIVE"||state.pending)return;
 while((state.mirrorRayQueue?.length??0)>0) {
  const id=state.mirrorRayQueue!.shift()!;
  const mirror=state.constructions?.find(c=>c.id===id&&c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0);
  if(!mirror)continue;
  const rival=state.actors[other(mirror.owner)];
  const reach=mirror.mirror!.rangeMeters;
  const distance=mirrorRayDistanceMeters(state,mirror);
  if(distance>reach) {
   addLog(state,{kind:"MIRROR",tick:state.tick,by:mirror.owner,constructionId:id,
    summary:mirror.label+" no alcanzó a "+rival.name+": "+Number(distance.toFixed(2))+" m desde el espejo (alcance "+reach+" m)."});
   continue;
  }
  // Repeated rays use the owner's current magic attack, including temporary buffs.
  const point={...targetHitboxCenter};
  state.pending={by:mirror.owner,against:other(mirror.owner),attackType:"PIERCE",
   trajectory:mirrorRayTrajectory(mirror),
   launchedAtTick:(state.round-1)*LIMIT,usesMagic:true,areaHint:magicImpactZone(point),
   targetCenter:point,mirrorId:id,mirrorAuto:true,
   directedMagicRay:mirror.fieldPosition?{
    from:{...mirror.fieldPosition},to:fieldPosition(rival)}:undefined,
   skill:{id:mirror.sourceSkillId,name:mirror.label+" · Rayo",damageMultiplier:mirror.mirror!.rayMultiplier,
    defenseFactor:1,finalMultiplier:1}};
  state.tick=Math.max(state.tick,(state.round-1)*LIMIT);
  addLog(state,{kind:"ATTACK",tick:state.tick,by:mirror.owner,against:other(mirror.owner),
   attackType:"PIERCE",usesMagic:true,skillId:mirror.sourceSkillId,
   constructionId:id,skillName:mirror.label+" · Rayo",mirrorShot:true,
   summary:mirror.label+" proyectó un rayo mágico perforante hacia "+rival.name+"."});
  return;
 }
}
/** The terminal encounter cleanup must also run for reflected magic.
 * Reflection is direct damage and must never be reflected recursively.
 */
function finishMutualEncounter(state:CombatState) {
 if(state.status==="FINISHED")return;
 state.status="FINISHED";state.winner=null;
 state.pending=null;state.mirrorRayQueue=[];
 addLog(state,{kind:"END",tick:state.tick,by:"PLAYER",against:"NPC",
  summary:"Ambos combatientes cayeron durante el intercambio simultáneo: empate"});
 settleDroppedWeapons(state);
 clearKarmaBoostsAtCombatEnd(state);
 state.narrativeText=narrateCombat(state.narrativeHistory??state.log,state.actors);
 state.narrativeVersion=COMBAT_NARRATIVE_VERSION;
}
function finishEncounter(state:CombatState,winner:Side) {
 if(state.status==="FINISHED")return;
 const defeated=other(winner);
 state.status="FINISHED";state.winner=winner;
 state.pending=null;state.mirrorRayQueue=[];
 addLog(state,{kind:"END",tick:state.tick,by:winner,against:defeated,
   summary:state.actors[winner].name+" gana el combate"});
 settleDroppedWeapons(state);
 clearKarmaBoostsAtCombatEnd(state);
 state.narrativeText=narrateCombat(state.narrativeHistory??state.log,state.actors);
 state.narrativeVersion=COMBAT_NARRATIVE_VERSION;
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
    expireSummonStatuses(state);
    upkeepSummons(state);
    addLog(state,{kind:"ROUND",tick:state.tick,by:"PLAYER",summary:"Comienza el turno " + state.round});
    state.itemRepairsThisRound=[];
    for(const side of SIDES){
      dispatchCombatMicroEvent(state,side,"TURN_START");
      applyWeaponSelfRepairAtRoundStart(state,side);
    }
    // Each active mirror fires at most once on the following and later rounds.
    state.mirrorRayQueue=(state.constructions??[])
      .filter(c=>c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0)
      .map(c=>c.id);
    beginNextMirrorRay(state);
  }
}
function spend(f: CombatFighter, ticks: number) {
  f.spentAp++;
  f.spentTicks = Math.min(LIMIT, f.spentTicks + ticks);
}
/** Summons are encounter actors, but all orders spend their owner's PA/ticks.
 * No automatic free actions are created by merely owning seven creatures.
 */
function summonAsFighter(summon:CombatSummon,owner:CombatFighter):CombatFighter {
  const pos={...summon.fieldPosition};
  return {...owner,name:summon.label,fieldPosition:pos,positionMeters:pos.x,
    physicalAttack:summonStat(summon,owner,"PHYSICAL_ATTACK"),
    physicalDefense:summonStat(summon,owner,"PHYSICAL_DEFENSE"),
    agility:summonStat(summon,owner,"AGI"),
    speedValue:summonStat(summon,owner,"MOVE_SPEED"),
    strength:summonStat(summon,owner,"STRENGTH"),
    precision:summonStat(summon,owner,"PRECISION"),
    dodge:summonStat(summon,owner,"DODGE"),
    magicAttack:summonStat(summon,owner,"MAGIC_ATTACK"),
    magicDefense:summonStat(summon,owner,"MAGIC_DEFENSE"),
    constitution:summonStat(summon,owner,"CON"),
    critical:summonStat(summon,owner,"CRITICAL"),
    luck:summonStat(summon,owner,"LUCK"),
    race:summonStat(summon,owner,"RACE"),
    massKg:Math.max(1,summonStat(summon,owner,"MASS_KG")),
    equippedWeapon:undefined,offhandWeapon:undefined,
    perkIds:[],damageTakenFactors:undefined};
}
function summonStepLimit(summon:CombatSummon,owner:CombatFighter):number {
  const base=Math.max(1,Math.round(Math.max(0,summonStat(summon,owner,"RACE"))/10));
  const current=summonStat(summon,owner,"MOVE_SPEED");
  const agility=Math.max(1,summonStat(summon,owner,"AGI"));
  // Every component can be independently preconfigured; linked summons retain
  // the old speed/race behavior when no intrinsic values are specified.
  return Math.min(15,base*Math.max(0,current)/agility);
}
function moveSummonOnField(state:CombatState,summon:CombatSummon,delta:Point):number {
  if(!finite(delta.x)||!finite(delta.y))throw new Error("Movimiento de invocación inválido.");
  const owner=state.actors[summon.owner];
  const length=Math.hypot(delta.x,delta.y);
  if(length>summonStepLimit(summon,owner)+0.01)
    throw new Error("La criatura no puede recorrer tantos metros en una acción.");
  const from=summon.fieldPosition,to={x:from.x+delta.x,y:from.y+delta.y};
  if(Math.hypot(to.x-fieldPosition(owner).x,to.y-fieldPosition(owner).y)>summon.controlRangeMeters+1e-8)
    throw new Error("La criatura debe permanecer dentro de su radio de control.");
  assertMovementClear(state.constructions,from,to);
  summon.fieldPosition=to;
  return length;
}
function summonTargetPosition(state:CombatState,summon:CombatSummon):Point {
  return fieldPosition(state.actors[summon.behavior.target==="OPPONENT"?other(summon.owner):summon.owner]);
}
function advanceSummonToward(state:CombatState,summon:CombatSummon,point:Point,stopAt:number):number {
  const from=summon.fieldPosition;
  const dx=point.x-from.x,dy=point.y-from.y;
  const distance=Math.hypot(dx,dy);
  if(distance<=stopAt)return 0;
  const step=Math.min(distance-stopAt,summonStepLimit(summon,state.actors[summon.owner]));
  if(step<=0)return 0;
  return moveSummonOnField(state,summon,{x:dx/distance*step,y:dy/distance*step});
}
/** Inspect an already-approved creature's contact configuration before paying
 * an action. User-selected stats and status IDs must belong to this encounter.
 * A pending attack can then safely resolve without a late invalid input.
 */
function validateSummonContactSelection(state:CombatState,summon:CombatSummon,
 chosenStat?:string,chosenStatusId?:string):void {
 for(const effect of summon.contactEffects??[]){
   const target:Side=effect.target==="USER"?summon.owner:other(summon.owner);
   if(effect.kind==="APPLY_STATUS"&&typeof effect.stat!=="string"&&effect.stat.mode==="COMBAT"){
     if(!chosenStat||!effect.stat.allowed.includes(chosenStat))
       throw new Error("Elige una estadística autorizada para el contacto de la criatura.");
   }
   if(effect.kind==="INVERT_STATUS"&&effect.selection==="SELECTED_DEBUFF"){
     const status=state.summonStatuses?.find(s=>s.id===chosenStatusId&&s.target===target&&isDebuffStatus(s));
     if(!status)throw new Error("Selecciona un debilitamiento activo del objetivo para invertirlo.");
   }
   if(effect.kind==="INVERT_STATUS"&&
     (state.summonStatuses??[]).some(s=>s.target===target&&isDebuffStatus(s))){
     const available=state.mana?.[summon.owner]?.current??0;
     if(available<effect.manaCost)
       throw new Error("Maná insuficiente para invertir el debilitamiento.");
   }
 }
}
function resolveSummonContact(state:CombatState,summon:CombatSummon,params:{
 target:Side;contact:boolean;hpDamage:number;randomRoll:number;
 chosenStat?:string;chosenStatusId?:string;
}):void {
 if(!params.contact || !(summon.contactEffects?.length))return;
 if(summon.behavior.trigger==="HP_DAMAGE"&&params.hpDamage<=0)return;
 for(const [index,effect] of summon.contactEffects.entries()){
   const target:Side=effect.target==="USER"?summon.owner:other(summon.owner);
   if(target!==params.target)continue;
   if(effect.kind==="APPLY_STATUS"){
     const stat=typeof effect.stat==="string"?effect.stat:
       effect.stat.mode==="FIXED"?effect.stat.fixed:
       effect.stat.mode==="COMBAT"?params.chosenStat:
       effect.stat.allowed[Math.min(effect.stat.allowed.length-1,
         Math.floor(params.randomRoll*effect.stat.allowed.length))];
     if(!stat||!resolveStatusStat(stat))
       throw new Error("La estadística seleccionada no es válida para este estado.");
     const status=applySummonStatus(state,{
       id:summon.id+":"+state.round+":"+state.tick+":"+state.log.length+":"+index,
       sourceSummonId:summon.id,by:summon.owner,target,stat,
       operation:effect.operation,value:effect.value,durationTurns:effect.durationTurns,
     });
     addLog(state,{kind:"STATUS",tick:state.tick,by:summon.owner,against:target,
       summonId:summon.id,summary:summon.label+" aplicó "+
       (isDebuffStatus(status)?"un debilitamiento":"una mejora")+" a "+
       state.actors[target].name+": "+status.stat+" ("+
       (status.operation==="MULTIPLIER"?"×"+status.value:String(status.value>=0?"+":"")+status.value)+
       ") durante "+effect.durationTurns+" turnos."});
   }else{
     const available=(state.summonStatuses??[]).filter(s=>s.target===target&&isDebuffStatus(s));
     const selected=effect.selection==="SELECTED_DEBUFF"
       ?available.find(s=>s.id===params.chosenStatusId):available.at(-1);
     if(!selected)continue;
     const mana=state.mana?.[summon.owner];
     if(!mana||mana.current<effect.manaCost)
       throw new Error("Maná insuficiente para invertir el debilitamiento.");
     const inverted=invertSummonStatus(state,target,selected.id);
     if(!inverted)continue;
     mana.current-=effect.manaCost;
     if(effect.chargeAccumulator)
       creditCombatCharge(state,summon.owner,effect.chargeAccumulator);
     addLog(state,{kind:"STATUS",tick:state.tick,by:summon.owner,against:target,
       summonId:summon.id,manaCost:effect.manaCost,
       summary:summon.label+" invirtió "+inverted.stat+" de "+state.actors[target].name+
       " y pagó "+effect.manaCost+" maná."});
   }
 }
}
function orderSummon(state:CombatState,by:Side,command:Extract<CombatCommand,{kind:"COMMAND_SUMMON"}>,rolls:{hit:number;critical:number;defense:number}):void {
  const summon=state.summons?.find(s=>s.id===command.summonId&&s.owner===by);
  if(!summon)throw new Error("No controlas esa invocación o ha desaparecido.");
  const owner=state.actors[by];
  if(Math.hypot(summon.fieldPosition.x-fieldPosition(owner).x,
      summon.fieldPosition.y-fieldPosition(owner).y)>summon.controlRangeMeters+1e-8)
    throw new Error("La invocación quedó fuera del alcance de control.");
  if(command.order==="CHANGE_BEHAVIOR"){
    if(!command.newBehavior||!summon.behavior.allowedModes.includes(command.newBehavior))
      throw new Error("Ese comportamiento no está autorizado para la criatura.");
    summon.behavior.mode=command.newBehavior;
    spend(owner,turnTicks(owner));
    state.tick=Math.max(state.tick,(state.round-1)*LIMIT+owner.spentTicks);
    addLog(state,{kind:"SUMMON",tick:state.tick,by,summonId:summon.id,
      summary:summon.label+" cambió su comportamiento a "+command.newBehavior});
    advanceRoundIfComplete(state);return;
  }
  let order=command.order;
  if(order==="ACT") {
    const target=summonTargetPosition(state,summon);
    const near=Math.hypot(target.x-summon.fieldPosition.x,
      target.y-summon.fieldPosition.y)<=0.65;
    const hasTouch=summon.contactEffects?.some(e=>e.target===summon.behavior.target);
    order=summon.behavior.mode==="ATTACK"?"ATTACK":
      near&&hasTouch?"ACT":summon.behavior.mode==="HOLD"?"ACT":"MOVE";
  }
  if(order==="MOVE"){
    let distance:number;
    if(command.order==="MOVE"){
      if(!summon.behavior.allowedModes.includes("MANUAL"))
        throw new Error("El movimiento manual no está permitido para esa criatura.");
      const delta=validatePlanarMove(command.planarMove);
      distance=moveSummonOnField(state,summon,delta);
    }else{
      const target=summonTargetPosition(state,summon);
      distance=advanceSummonToward(state,summon,target,0.35);
    }
    spend(owner,turnTicks(owner));
    state.tick=Math.max(state.tick,(state.round-1)*LIMIT+owner.spentTicks);
    addLog(state,{kind:"SUMMON",tick:state.tick,by,summonId:summon.id,
      summary:summon.label+(distance>0?" se movió "+distance.toFixed(2)+" m.":" alcanzó su posición de apoyo.")});
    advanceRoundIfComplete(state);return;
  }
  if(order==="ATTACK"){
    if(summon.behavior.target!=="OPPONENT"||
      !(summon.behavior.mode==="ATTACK"||summon.behavior.allowedModes.includes("MANUAL")))
      throw new Error("La criatura no tiene autorización para atacar a ese objetivo.");
    if(command.planarMove)throw new Error("Mover y atacar con una criatura requiere dos acciones.");
    const enemy=fieldPosition(state.actors[other(by)]);
    if(Math.hypot(enemy.x-summon.fieldPosition.x,enemy.y-summon.fieldPosition.y)>1.5){
      if(command.order==="ATTACK")throw new Error("El enemigo está fuera del alcance del familiar (1.5 m).");
      const distance=advanceSummonToward(state,summon,enemy,1.35);
      spend(owner,turnTicks(owner));
      state.tick=Math.max(state.tick,(state.round-1)*LIMIT+owner.spentTicks);
      addLog(state,{kind:"SUMMON",tick:state.tick,by,summonId:summon.id,
        summary:summon.label+" persiguió al enemigo "+distance.toFixed(2)+" m."});
      advanceRoundIfComplete(state);return;
    }
    assertMovementClear(state.constructions,summon.fieldPosition,enemy);
    validateSummonContactSelection(state,summon,command.chosenStat,command.chosenStatusId);
    spend(owner,turnTicks(owner));
    state.tick=Math.max(state.tick,(state.round-1)*LIMIT+owner.spentTicks);
    state.pending={by,against:other(by),attackType:"BLUNT",
      trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}],
      explicitTrajectory:false,launchedAtTick:(state.round-1)*LIMIT+owner.spentTicks,
      usesMagic:false,summonId:summon.id,
      chosenSummonStat:command.chosenStat,
      chosenSummonStatusId:command.chosenStatusId};
    addLog(state,{kind:"ATTACK",tick:state.tick,by,against:other(by),
      attackType:"BLUNT",summonId:summon.id,
      summary:summon.label+" atacó a "+state.actors[other(by)].name+"; esperando reacción"});
    return;
  }
  if(order==="ACT"){
    const target:Side=summon.behavior.target==="USER"?by:other(by);
    const pos=fieldPosition(state.actors[target]);
    const near=Math.hypot(pos.x-summon.fieldPosition.x,pos.y-summon.fieldPosition.y)<=0.65;
    if(summon.contactEffects?.length&&near)
      validateSummonContactSelection(state,summon,command.chosenStat,command.chosenStatusId);
    spend(owner,turnTicks(owner));
    state.tick=Math.max(state.tick,(state.round-1)*LIMIT+owner.spentTicks);
    if(near)resolveSummonContact(state,summon,{
      target,contact:true,hpDamage:0,randomRoll:rolls.hit,
      chosenStat:command.chosenStat,chosenStatusId:command.chosenStatusId,
    });
    addLog(state,{kind:"SUMMON",tick:state.tick,by,summonId:summon.id,
      summary:summon.label+(near&&summon.contactEffects?.length?" tocó a su objetivo.":" mantuvo su posición.")});
    advanceRoundIfComplete(state);
    return;
  }
  throw new Error("Orden de criatura desconocida.");
}
function upkeepSummons(state:CombatState):void {
  // Migrate charges before removing a legacy summon at the round boundary.
  ensureCombatChargePool(state,"PLAYER");
  ensureCombatChargePool(state,"NPC");
  const retained:CombatSummon[]=[];
  for(const summon of state.summons??[]){
    const owner=state.actors[summon.owner],mana=state.mana?.[summon.owner];
    const tooFar=Math.hypot(summon.fieldPosition.x-fieldPosition(owner).x,
      summon.fieldPosition.y-fieldPosition(owner).y)>summon.controlRangeMeters+1e-8;
    const expired=state.round>=summon.expiresAtRound||owner.hp<=0||
      tooFar||!mana||mana.current<summon.maintenanceMana;
    if(expired){
      addLog(state,{kind:"SUMMON",tick:state.tick,by:summon.owner,summonId:summon.id,
        summary:summon.label+" desapareció"+
          (tooFar?" (fuera de control).":state.round>=summon.expiresAtRound?" (fin de duración).":
            " (sin maná para mantenimiento).")});
      continue;
    }
    mana.current-=summon.maintenanceMana;
    addLog(state,{kind:"SUMMON",tick:state.tick,by:summon.owner,summonId:summon.id,
      manaCost:summon.maintenanceMana,
      summary:summon.label+" se mantuvo activo por "+summon.maintenanceMana+" maná."});
    retained.push(summon);
  }
  state.summons=retained;
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
/** Direct targeting a visible enemy mirror is an immediate object interaction:
 * mirrors do not dodge or spend reaction PA; physical hits break them and
 * magical hits reflect the configured portion to the attacking caster.
 */
function resolveTargetedMirrorAttack(
 state:CombatState,by:Side,command:Extract<CombatCommand,{kind:"ATTACK"}>,
 mirror:CombatConstruction,rolls:{hit:number;critical:number;defense:number},
 skill?:{id:number;name:string;damageMultiplier:number;finalMultiplier:number},
 skillArea?:CombatAttackArea,
){
 const actor=state.actors[by];
 const magic=command.usesMagic===true;
 const ranged=command.rangedPhysical===true||command.throwWeapon===true;
 const points=command.trajectory?.length?command.trajectory:[{x:0.1,y:0.5},{x:0.9,y:0.5}];
 const radius=magic?BASIC_MAGIC_AREA_RADIUS:
  command.attackType==="BLUNT"?0.17:command.attackType==="CUT"?0.11:0.07;
 const contact=magic||ranged||skillArea
  ?validArenaPoint(command.areaCenter)&&(skillArea
    ?attackAreaHits(command.areaCenter,mirror.center,skillArea,command.areaAngleDegrees)
    :Math.hypot(command.areaCenter.x-mirror.center.x,command.areaCenter.y-mirror.center.y)<=radius)
  :geometricContact(command.attackType,points,mirror.center);
 const power=magic?actor.magicAttack:actor.physicalAttack;
 const critical=contact&&rolls.critical<clamp(0.05+actor.critical/(actor.critical+100)*0.20,0.05,0.25);
 const damage=contact?Math.max(1,Math.round(Math.max(0,power)*(skill?.damageMultiplier??1)
  *(skill?.finalMultiplier??1)*(critical?1.5:1))):0;
 state.tick=Math.max(state.tick,(state.round-1)*LIMIT+actor.spentTicks);
 addLog(state,{kind:"ATTACK",tick:state.tick,by,against:mirror.owner,
  attackType:command.attackType,usesMagic:magic,rangedPhysical:ranged,
  constructionId:mirror.id,skillId:skill?.id,skillName:skill?.name,
  summary:actor.name+" apuntó a "+mirror.label+" con "+(skill?.name??(magic?"magia":"un ataque físico"))});
 let reflected=0;
 if(contact){
  if(magic){
   reflected=Math.max(0,Math.round(damage*(mirror.mirror?.reflectionMultiplier??0)));
   actor.hp=Math.max(0,actor.hp-reflected);
   addLog(state,{kind:"REFLECTION",tick:state.tick,by:mirror.owner,against:by,
    constructionId:mirror.id,damage:reflected,contact:true,
    summary:mirror.label+" reflejó "+reflected+" puntos de daño mágico hacia "+actor.name});
  }else{
   mirror.durability=Math.max(0,(mirror.durability??0)-damage);
   if(mirror.durability===0){
    state.constructions=state.constructions?.filter(c=>c.id!==mirror.id);
    state.mirrorRayQueue=state.mirrorRayQueue?.filter(id=>id!==mirror.id);
    addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by,
     constructionId:mirror.id,damage,contact:true,
     summary:actor.name+" destruyó "+mirror.label+" con un ataque físico."});
   }
  }
 }
 addLog(state,{kind:"RESOLVE",tick:state.tick,by,against:mirror.owner,
  attackType:command.attackType,damage:magic?reflected:damage,contact,critical,
  constructionId:mirror.id,
  summary:contact?(magic?mirror.label+" devolvió la magia a "+actor.name:
   actor.name+" golpeó "+mirror.label+" ("+damage+" HP)"):
   actor.name+" falló al atacar "+mirror.label});
 if(actor.hp<=0)finishEncounter(state,mirror.owner);
}
/** A direct hit on a summoned creature follows the same attack resources
 * and geometric aim as a strike at a tangible mirror. The entity has no free
 * dodge; each real contact lowers integrity and counts as one of its hits.
 */
function resolveTargetedSummonAttack(
 state:CombatState,by:Side,command:Extract<CombatCommand,{kind:"ATTACK"}>,
 summon:CombatSummon,rolls:{hit:number;critical:number;defense:number},
 skill?:{id:number;name:string;damageMultiplier:number;finalMultiplier:number},
 skillArea?:CombatAttackArea,
){
 validateRoll(rolls.hit);validateRoll(rolls.critical);
 const attacker=state.actors[by],magic=command.usesMagic===true;
 const ranged=command.rangedPhysical===true||command.throwWeapon===true;
 const points=command.trajectory?.length?command.trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}];
 const radius=magic?BASIC_MAGIC_AREA_RADIUS:
   command.attackType==="BLUNT"?0.17:command.attackType==="CUT"?0.11:0.07;
 const center={x:0.5,y:0.5};
 const contact=magic||ranged||skillArea
   ?validArenaPoint(command.areaCenter)&&
     (skillArea?attackAreaHits(command.areaCenter,center,skillArea,command.areaAngleDegrees):
     Math.hypot(command.areaCenter.x-center.x,command.areaCenter.y-center.y)<=radius)
   :geometricContact(command.attackType,points,center);
 let damage=0;
 if(contact){
   const power=magic?attacker.magicAttack:attacker.physicalAttack;
   const defense=summonStat(summon,state.actors[summon.owner],"PHYSICAL_DEFENSE");
   const critical=rolls.critical<
     clamp(0.05+attacker.critical/(attacker.critical+100)*0.2,0.05,0.25);
   const factor=matchupMultiplier(command.attackType,"SOLID");
   damage=Math.max(1,Math.round(power*(skill?.damageMultiplier??1)*(critical?1.5:1)*factor-
     defense*0.75));
   damage=Math.max(1,Math.round(damage*(skill?.finalMultiplier??1)));
   summon.integrity=Math.max(0,summon.integrity-damage);
   summon.hitCount++;
   if(summon.integrity<=0||summon.hitCount>=summon.hitLimit){
     state.summons=state.summons?.filter(x=>x.id!==summon.id);
     addLog(state,{kind:"SUMMON",tick:state.tick,by,against:summon.owner,
       summonId:summon.id,damage,contact:true,
       summary:summon.label+" desapareció tras recibir el impacto ("+summon.hitCount+
       "/"+summon.hitLimit+" golpes)."});
   }
 }
 addLog(state,{kind:"RESOLVE",tick:state.tick,by,against:summon.owner,
   summonId:summon.id,damage,contact,attackType:command.attackType,
   summary:contact?attacker.name+" golpeó a "+summon.label+" ("+damage+" de integridad).":
     attacker.name+" falló el ataque dirigido a "+summon.label+"."});
}
/** Legacy encounters persisted one shared integrity gauge that belonged to
 * main hand (offhand if main was empty). Carry that previous wear into the
 * per-weapon snapshot exactly once; never copy offhand wear onto main in new
 * encounters.
 */
function upgradeLegacyWeaponDurability(state:CombatState){
 if(state.perHandWeaponDurability===true)return;
 for(const side of SIDES){
  const fighter=state.actors[side];
  const weapon=fighter.equippedWeapon??fighter.offhandWeapon;
  if(weapon && Number.isFinite(fighter.weaponIntegrity)){
   const previous=Number.isFinite(weapon.durability)?weapon.durability!:fighter.weaponIntegrity;
   weapon.durability=Math.max(0,Math.min(100,previous,fighter.weaponIntegrity));
  }
 }
 state.perHandWeaponDurability=true;
}
/** Builds a basic, server-validated attack for a simultaneous exchange.
 * It uses the actor's current weapon and range; the client never supplies a
 * hidden spell center, a free skill, or a forged attack trajectory. */
export function basicCounterAttack(state:CombatState,side:Side,preferMagic=false):
 Extract<CombatCommand,{kind:"ATTACK"}>|null {
 const fighter=state.actors[side],target=state.actors[other(side)];
 if(remainingAp(fighter)<1||fighter.spentTicks>=LIMIT||state.status!=="ACTIVE")return null;
 const distance=fieldDistance(fighter,target);
 const magic=state.mana?.[side]&&state.mana[side].current>=1&&
  fighter.magicAttack>0&&distance<=BASIC_MAGIC_RANGE_METERS;
 const source=defaultAttackSource(fighter);
 const weapon=weaponForSource(fighter,source);
 const ranged=weapon?.mode==="RANGED";
 const reachable=distance<=effectiveWeaponReachMeters(fighter,false,source)&&
  (ranged||!["MAIN_HAND","OFF_HAND"].includes(source)||!!weapon);
 const spell=():Extract<CombatCommand,{kind:"ATTACK"}>=>({
  kind:"ATTACK",attackType:fighter.attackType,usesMagic:true,areaCenter:{x:0.5,y:0.5}
 });
 if(preferMagic&&magic)return spell();
 if(reachable){
  if(ranged)return {kind:"ATTACK",attackSource:source,attackType:weapon!.attackType,
   rangedPhysical:true,areaCenter:{x:0.5,y:0.5}};
  const attackType=weapon?.attackType??"BLUNT";
  const anchor=physicalAttackStart(state,side,source)??{x:0.1,y:0.5};
  const crossesCenter=attackType==="CUT";
  const destination:Point=crossesCenter
    ? {x:anchor.x<0.5?0.9:0.1,y:anchor.y===0.5?0.5:anchor.y<0.5?0.9:0.1}
    : {x:0.5,y:0.5};
  return {kind:"ATTACK",attackSource:source,attackType,
   trajectory:[{...anchor},destination]};
 }
 return magic?spell():null;
}
export function applyCombatCommand(original: CombatState, by: Side, command: CombatCommand,
  rolls: {hit:number; critical:number; defense:number} = {hit:0.5,critical:0.5,defense:0.5},
  serverSkillRangeMeters?:number,
  mirrorSkill?:{id:number;name:string;damageMultiplier:number;finalMultiplier:number},
  serverSkillArea?:CombatAttackArea,
  /** Internal: an exchanged attack pays resources but not an extra initiative. */
  exchangedAttack=false,
  /** An independent server dice roll for the exchanged strike. */
  counterRolls=rolls): CombatState {
  const state = structuredClone(original);
  if (state.version !== 1 || state.status !== "ACTIVE") throw new Error("El combate no está activo.");
  if (!SIDES.includes(by)) throw new Error("Combatiente no válido.");
  upgradeLegacyWeaponDurability(state);
  const fighter = state.actors[by], rival = state.actors[other(by)];
  // Distort intentional planar vectors only. Preserve the submitted length,
  // action ticks, physical collision checks and attack trajectories.
  if((command.kind==="ATTACK"||command.kind==="DEFEND")&&command.planarMove!==undefined){
    const requested=validatePlanarMove(command.planarMove);
    command={...command,planarMove:distortChaosMove(state,by,requested)};
  }
  if (state.pending) {
    const pending = state.pending;
    if (command.kind !== "DEFEND" || pending.against !== by) throw new Error("Debe responder al ataque pendiente.");
    if (!["DODGE","BLOCK","ENDURE","REPEL","DEFLECT","MAGIC_FIELD","CONSTRUCTION","COUNTER","NONE"].includes(command.defense))
      throw new Error("Defensa desconocida.");
    validateRoll(rolls.hit); validateRoll(rolls.critical); validateRoll(rolls.defense);
    const summonedAttacker=pending.summonId?
      state.summons?.find(s=>s.id===pending.summonId&&s.owner===pending.by):undefined;
    if(pending.summonId&&!summonedAttacker)
      throw new Error("La criatura que atacaba ya no está disponible.");
    const attacker = summonedAttacker?
      summonAsFighter(summonedAttacker,state.actors[pending.by]):state.actors[pending.by];
    // A directed magical strike can be intercepted before any defender
    // reaction is charged. Only the server-captured world ray counts: a
    // defender-facing canvas marker or longitudinal legacy mirror coordinate
    // is NOT an invented world position or a line-of-sight obstacle.
    const rayIntercept=pending.usesMagic&&!pending.attackArea&&pending.directedMagicRay
      ?firstMirrorAlongMagicRay(state.constructions,by,
         pending.directedMagicRay.from,pending.directedMagicRay.to,pending.mirrorId)
      :null;
    if(rayIntercept){
      const mirror=rayIntercept.mirror;
      const power=Math.max(0,attacker.magicAttack);
      const direct=Math.max(1,Math.round(power*
        (pending.skill?.damageMultiplier??1)*(pending.skill?.finalMultiplier??1)));
      const reflected=Math.max(0,Math.round(direct*(mirror.mirror?.reflectionMultiplier??0)));
      attacker.hp=Math.max(0,attacker.hp-reflected);
      state.tick=Math.max(state.tick,(state.round-1)*LIMIT+attacker.spentTicks,
        (state.round-1)*LIMIT+fighter.spentTicks);
      addLog(state,{kind:"REFLECTION",tick:state.tick,by,against:pending.by,
        constructionId:mirror.id,contact:true,damage:reflected,
        summary:mirror.label+" interceptó el rayo mágico de "+attacker.name+
          " y reflejó "+reflected+" de daño hacia su origen."});
      addLog(state,{kind:"RESOLVE",tick:state.tick,by:pending.by,against:by,
        attackType:pending.attackType,usesMagic:true,contact:false,critical:false,
        damage:0,defense:"NONE",skillId:pending.skill?.id,
        mirrorShot:Boolean(pending.mirrorId),constructionId:mirror.id,
        areaCenter:pending.targetCenter,
        summary:mirror.label+" interceptó la trayectoria del hechizo antes de alcanzar a "+
          fighter.name+" (0 HP)."});
      state.pending=null;
      if(pending.movementOrder==="AFTER"&&pending.planarMove&&attacker.hp>0)
        finishCompositeStep(state,pending.by,pending.planarMove);
      if(attacker.hp<=0)finishEncounter(state,by);
      if(state.status==="ACTIVE")beginNextMirrorRay(state);
      advanceRoundIfComplete(state);
      return state;
    }
    // Basic phase-1 magic has an existing measured .14 radius for object
    // collisions/reflections, even though its legacy fighter damage model is
    // not a configured CombatAttackArea. Single-target approved skills and
    // mirror rays do not inherit an invented splash.
    const objectImpactArea:CombatAttackArea|undefined=pending.attackArea??
      (pending.usesMagic&&!pending.skill&&validArenaPoint(pending.targetCenter)
        ?{shape:"CIRCLE",radiusMeters:BASIC_MAGIC_AREA_RADIUS*AREA_CANVAS_METERS,
          radiusNormalized:BASIC_MAGIC_AREA_RADIUS}
        :undefined);
    // A pending hit must be resolvable even when the defender already spent
    // their last PA or tick on an earlier reaction in this same round.
    // Downgrade BEFORE validating/launching COUNTER or other paid defenses:
    // otherwise a stale client selection can strand the pending attack.
    const exhaustedReaction=remainingAp(fighter)<=0||fighter.spentTicks>=LIMIT;
    let defense:DefenseChoice=exhaustedReaction?"NONE":command.defense;
    // The defender can trade a normal paid basic attack for full exposure to
    // the incoming strike. Resolve on a separate snapshot first, but apply
    // both results together so an otherwise lethal strike cannot cancel it.
    let exchange: {
     damageToAttacker:number;damageToDefender:number;spentAp:number;spentTicks:number;
     manaRemaining?:number;physicalPathEnd?:CombatState["physicalPathEnd"];
     physicalPathEnds?:CombatState["physicalPathEnds"];events:CombatLog[];
     /** Counter resolves on a shadow to preserve simultaneous lethal damage.
      * Transfer its physical cover wear separately, without overwriting
      * damage already dealt by the incoming strike to the same wall.
      */
     constructionWear:Array<{id:string;wear:number}>;
     attackerPosition?:Point;attackerPositionMeters:number;
    }|null=null;
    if(defense==="COUNTER"){
      if(pending.mirrorAuto||pending.mirrorId||pending.summonId)
        throw new Error("El ataque de un espejo o una invocación exige una defensa normal, no un contraataque simultáneo.");
      const plan=basicCounterAttack(state,by,command.counterMagic===true);
      if(!plan)throw new Error("No tienes PA, ticks o un ataque básico al alcance para contraatacar.");
      const shadow=structuredClone(state);
      shadow.pending=null;
      const launched=applyCombatCommand(shadow,by,plan,counterRolls,undefined,undefined,undefined,true);
      if(!launched.pending)throw new Error("El contraataque no alcanzó a prepararse.");
      const resolved=applyCombatCommand(launched,other(by),{kind:"DEFEND",defense:"NONE"},counterRolls);
      exchange={
       damageToAttacker:Math.max(0,attacker.hp-resolved.actors[pending.by].hp),
       damageToDefender:Math.max(0,fighter.hp-resolved.actors[by].hp),
       // The shadow's automatic round advance may reset AP/ticks after
       // resolving the strike. Preserve the actual cost at launch instead;
       // the real state advances its round only after BOTH attacks land.
       spentAp:launched.actors[by].spentAp,spentTicks:launched.actors[by].spentTicks,
       manaRemaining:launched.mana?.[by]?.current,
       physicalPathEnd:launched.physicalPathEnd,
       physicalPathEnds:launched.physicalPathEnds,
       events:resolved.log.slice(state.log.length).filter(e=>["ATTACK","RESOLVE","REFLECTION","CONSTRUCTION"].includes(e.kind)),
       constructionWear:(state.constructions??[]).flatMap(wall=>{
        if(wall.form!=="BLOCK"||!measuredBlock(wall))return [];
        const remaining=resolved.constructions?.find(c=>c.id===wall.id)?.durability??0;
        const wear=Math.max(0,(wall.durability??0)-remaining);
        return wear>0?[{id:wall.id,wear}]:[];
       }),
       attackerPosition:resolved.actors[pending.by].fieldPosition,
       attackerPositionMeters:resolved.actors[pending.by].positionMeters
      };
      defense="NONE";
      fighter.spentAp=exchange.spentAp;fighter.spentTicks=exchange.spentTicks;
      if(state.mana?.[by]&&exchange.manaRemaining!==undefined)
       state.mana[by].current=exchange.manaRemaining;
      if(exchange.physicalPathEnd)state.physicalPathEnd=exchange.physicalPathEnd;
      if(exchange.physicalPathEnds)state.physicalPathEnds=exchange.physicalPathEnds;
    }
    if(pending.attackArea&&defense==="DEFLECT")
      throw new Error("Los ataques circulares, las franjas, los conos y los barridos de área no se pueden desviar con una guardia lineal.");
    if (pending.usesMagic && !["DODGE","ENDURE","MAGIC_FIELD","CONSTRUCTION","NONE"].includes(defense))
      throw new Error("Para la explosión mágica básica puedes esquivar, levantar un campo mágico, resistir o no reaccionar.");
    if (!pending.usesMagic && defense === "MAGIC_FIELD")
      throw new Error("El campo defensivo mágico solo puede responder a ataques mágicos.");
    // Validate the player's requested defense, not the effective one: when all
    // action ticks are spent the requested dodge is correctly downgraded to
    // NONE without misreporting its displacement as an illegal choice.
    if(command.dodgeDirection && command.defense!=="DODGE")
      throw new Error("Solo puedes elegir desplazamiento para Esquivar.");
    if(defense==="MAGIC_FIELD"){
      const mana=state.mana?.[by];
      if(!mana || mana.current<1)throw new Error("Necesitas 1 punto de maná para activar el campo mágico.");
      mana.current-=1;
    }
    // An exhausted defender cannot move for free. Ignore a stale prepared
    // movement when auto-accepting damage; still reject an explicit
    // move+NONE combination from an actor who could actually react.
    if(command.planarMove!==undefined&&!exhaustedReaction){
      if(defense==="NONE")throw new Error("No puedes combinar movimiento con una reacción sin PA.");
      applyCompositeStep(state,by,command.planarMove);
    }
    if (defense !== "NONE") spend(fighter,command.planarMove!==undefined?0:turnTicks(fighter));
    const materialAttackBonus=!pending.usesMagic&&pending.materialPerkBonus&&
      fighter.perkIds?.includes(pending.materialPerkBonus.perkId)
        ?pending.materialPerkBonus.attackBonus:0;
    const power = pending.usesMagic ? attacker.magicAttack : attacker.physicalAttack+materialAttackBonus;
    const baseProtection = pending.usesMagic ? fighter.magicDefense : fighter.physicalDefense;
    const protection = baseProtection * microResistanceMultiplier(state,by);
    // The magical field uses its own basic RPS type from the character sheet;
    // physical blocking retains the separately configured blockDefenseType.
    const defenseType=pending.usesMagic?(fighter.magicFieldType??fighter.defenseType):fighter.defenseType;
    const typeFactor = matchupMultiplier(pending.attackType, defenseType);
    let avoided = false;
    let damageScale = 1;
    let displaced = 0;
    let interceptedAreaBlockId: string|undefined;
    if (defense === "DODGE") {
      if (pending.usesMagic || pending.rangedPhysical || pending.attackArea&&pending.attackArea.shape!=="SELF_FIELD") {
        if (!validArenaPoint(pending.targetCenter)) throw new Error("Centro de ataque ausente.");
        if (!validArenaPoint(command.predictedCenter)) throw new Error("Marca dónde crees que caerá la explosión.");
        // Spatial prediction plus a genuine agility/precision contest.
        // The target was stored privately, never returned by the combat API.
        avoided = Math.hypot(pending.targetCenter.x-command.predictedCenter.x,pending.targetCenter.y-command.predictedCenter.y)
          <= (pending.attackArea?0.19:pending.rangedPhysical ? (pending.attackType==="BLUNT"?0.12:pending.attackType==="CUT"?0.085:0.045) : pending.attackType==="BLUNT"?0.19:pending.attackType==="CUT"?0.11:0.07)
          && rolls.hit >= contestChance(attacker.precision, fighter.dodge);
      } else {
        avoided = rolls.hit >= contestChance(attacker.precision, fighter.dodge);
      }
    } else if (defense === "BLOCK") {
      // One explicitly selected hand owns the wear. Without a selection use
      // the main hand, then offhand. Legacy/unarmed blocks keep neutral wear.
      const requestedWeapon=command.weaponSlot==="OFF_HAND"?fighter.offhandWeapon:
        command.weaponSlot==="MAIN_HAND"?fighter.equippedWeapon:undefined;
      if(command.weaponSlot&&!requestedWeapon)
        throw new Error("No tienes un arma equipada en la mano elegida para bloquear.");
      if(command.weaponSlot&&requestedWeapon&&!combatWeaponOperational(requestedWeapon))
        throw new Error("El arma elegida está rota y no puede bloquear.");
      const blockWeapon=requestedWeapon??
        (combatWeaponOperational(fighter.equippedWeapon)?fighter.equippedWeapon:
         combatWeaponOperational(fighter.offhandWeapon)?fighter.offhandWeapon:undefined);
      // No equipped weapon preserves the original unarmed guard behavior.
      // A broken equipped tool cannot masquerade as a full-integrity arm.
      const unarmed=!(fighter.equippedWeapon||fighter.offhandWeapon);
      const previousIntegrity=blockWeapon
        ?blockWeapon.durability??fighter.weaponIntegrity
        :unarmed?fighter.weaponIntegrity:0;
      const contest = contestChance(fighter.constitution * typeFactor, attacker.strength);
      const held = previousIntegrity > 0 && rolls.defense < contest;
      // Tool durability never substitutes for the wielder's CON.
      damageScale = held ? 0.12 : 0.8;
      const baseWear=Math.max(1,Math.ceil(power / 8));
      const wear=calculateMaterialBlockWear(baseWear,blockWeapon?.materialPhysicalResistance);
      const newIntegrity=Math.max(0,previousIntegrity-wear);
      if(blockWeapon||unarmed)fighter.weaponIntegrity=newIntegrity;
      if(blockWeapon){
        blockWeapon.durability=newIntegrity;
        if(previousIntegrity>0&&newIntegrity===0)
          addLog(state,{kind:"WEAPON_BREAK",tick:state.tick,by,
            summary:fighter.name+" rompió "+blockWeapon.name+" al bloquear. No puede usarla hasta repararla."});
      }
    } else if (defense === "MAGIC_FIELD") {
      // Basic defensive field: active reaction, paid AP/ticks, no persistent
      // barrier or mana expenditure until the configurable-skills phase.
      const effectiveField=Math.max(0,protection)/typeFactor;
      const held=rolls.defense < contestChance(effectiveField,attacker.magicAttack);
      damageScale=held ? 0.25 : 0.75;
    } else if(defense==="CONSTRUCTION") {
      const block=state.constructions?.find(c=>c.id===command.constructionId&&
        c.owner===by&&c.form==="BLOCK"&&c.tangible&&
        (c.durability??0)>0&&Math.hypot(c.center.x-targetHitboxCenter.x,c.center.y-targetHitboxCenter.y)<=0.35);
      if(!block)throw new Error("Selecciona un bloque defensivo cercano al personaje.");
      // A defender may choose cover from the public warning, but an area that
      // misses the actual block cannot be intercepted by an unrelated object.
      // Resolve that miss normally, charging the chosen reaction without
      // revealing the private epicenter or rejecting the guess.
      const overlaps=!objectImpactArea||constructionInAreaFootprint(
        block,objectImpactArea,pending.targetCenter,pending.areaAngleDegrees,
        fieldPosition(attacker));
      if(!overlaps){
        damageScale=1;
        addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by,
          constructionId:block.id,contact:false,
          summary:block.label+" no interceptó el área del ataque."});
      }else{
      if(objectImpactArea)interceptedAreaBlockId=block.id;
      const resistance=block.passive?.resistance;
      // USER is the owner of this defense/construction (fighter). OPPONENT is
      // the attacker. Keep both sides separate in the micro-module context.
      // Hit count belongs to the defensive block, not the attacking character.
      const blockDefense=resistance?calculateModularVariableResistance(resistance,{
        user:{
          stats:fighter as unknown as Record<string,number>,
          inputs:{
            ATTACK_SPEED:effectiveCombatSpeed(fighter),
            HP_PERCENT:100*fighter.hp/Math.max(1,fighter.maxHp),
            HIT_COUNT:block.hitCount??0,
          },
        },
        opponent:{
          stats:attacker as unknown as Record<string,number>,
          inputs:{
            ATTACK_SPEED:effectiveCombatSpeed(attacker),
            INCOMING_DAMAGE:power,
            HP_PERCENT:100*attacker.hp/Math.max(1,attacker.maxHp),
          },
        },
      }).resistance:fighter.magicDefense;
      const previous=block.durability??0;
      const pressure=Math.max(1,Math.round(power/typeFactor));
      const held=blockDefense>=power && previous>=pressure;
      block.hitCount=(block.hitCount??0)+1;
      block.durability=Math.max(0,previous-pressure);
      damageScale=held?0:0.5;
      if(block.durability===0) {
        state.constructions=state.constructions?.filter(c=>c.id!==block.id);
        addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by,constructionId:block.id,
          summary:block.label+" se rompió al interceptar el ataque."});
      }
      }
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
    if(defense==="DODGE"&&avoided&&command.dodgeDirection){
      const direction=command.dodgeDirection;
      if(!["AWAY","TOWARD","WEAPON"].includes(direction))throw new Error("Dirección de esquive inválida.");
      const dropped=activeDroppedWeapon(state,by,command.weaponSlot);
      if(direction==="WEAPON"&&!dropped)throw new Error("No hay arma arrojada hacia la cual esquivar.");
      const target=direction==="WEAPON"?dropped!.positionMeters:attacker.positionMeters;
      const sign=Math.sign(target-fighter.positionMeters)||1;
      const step=Math.min(0.5,Math.abs(target-fighter.positionMeters));
      const from=fieldPosition(fighter);
      const vector=distortChaosMove(state,by,
        {x:sign*(direction==="AWAY"?-0.5:step),y:0});
      assertMovementClear(state.constructions,from,
        {x:from.x+vector.x,y:from.y+vector.y});
      moveFighterOnField(fighter,vector);
      clearPhysicalStrokes(state,by);
      if(direction==="WEAPON"&&dropped&&Math.abs(fighter.positionMeters-dropped.positionMeters)<0.2){
        restoreWeapon(state,dropped);
      }
    }
    // No selected dodge means contact is checked against a small base margin,
    // not another invisible full Esquive roll.
    let contact = !avoided && (!pending.beyondEffectiveRange || rolls.hit<=0.65) && (
      // Basic magic preserves its established full-area effect. Projectile
      // placement and hand-drawn melee use the explicit geometric hitbox.
      pending.attackArea?.shape==="SELF_FIELD"
        ?true // Launch reach was checked against the caster, no detachable epicenter.
        :pending.attackArea
        ?validArenaPoint(pending.targetCenter)&&attackAreaHits(pending.targetCenter,targetHitboxCenter,pending.attackArea,pending.areaAngleDegrees)
        :pending.usesMagic || (pending.rangedPhysical
        ? validArenaPoint(pending.targetCenter) && Math.hypot(
          pending.targetCenter.x-targetHitboxCenter.x,pending.targetCenter.y-targetHitboxCenter.y
        ) <= (pending.attackType==="BLUNT"?0.17:pending.attackType==="CUT"?0.11:0.07)
        : geometricContact(pending.attackType,pending.trajectory,targetHitboxCenter))
    );
    let critical = contact && rolls.critical < clamp(0.05 + attacker.critical / (attacker.critical + fighter.luck + 100)*0.20,0.05,0.25);
    // A free phase-1 magical *basic* strike is intentionally bounded.
    // Full skill damage, mana expenditure and elemental effects belong to phase 2.
    const skill=pending.skill;
    const raw=skill
      ?Math.max(1,Math.round(power*skill.damageMultiplier*(critical?1.5:1)*typeFactor
        -protection*skill.defenseFactor*0.75))
      :pending.usesMagic
        ?Math.max(1,Math.round((3+5*power/(power+protection+20))*(critical?1.5:1)*typeFactor))
        :Math.max(1,Math.round(power*(critical?1.5:1)*typeFactor-protection*0.75));
    const racialFactor=racialDamageFactor(fighter.damageTakenFactors,pending.attackType,pending.usesMagic,skill?.damageElement);
    let damage = contact ? Math.max(0, Math.round(raw * damageScale * (skill?.finalMultiplier??1) * racialFactor)) : 0;
    // Only defense-stat mitigation counts; reaction-blocking/dodge and
    // construction reductions cannot be added to the stored value.
    const noResistanceRaw=skill
      ?Math.max(1,Math.round(power*skill.damageMultiplier*(critical?1.5:1)*typeFactor))
      :pending.usesMagic
        ?Math.max(1,Math.round((3+5*power/(power+20))*(critical?1.5:1)*typeFactor))
        :Math.max(1,Math.round(power*(critical?1.5:1)*typeFactor));
    let noResistanceDamage=contact?Math.max(0,Math.round(
      noResistanceRaw*damageScale*(skill?.finalMultiplier??1)*racialFactor)):0;
    let mitigatedByResistance=contact?Math.max(0,noResistanceDamage-damage):0;
    let physicalCoverLabel:string|undefined;
    // Horizontal positions come from the top-down plane; vertical heights
    // come ONLY from a deliberately drawn physical stroke. Basic spells,
    // area shapes, auto-generated strokes and unknown old BLOCK geometry
    // must not gain invented line-of-sight occlusion.
    if(contact&&!pending.usesMagic&&!pending.attackArea&&!pending.mirrorId&&
      pending.explicitTrajectory&&pending.trajectory.length>=2){
      const covers=coversAlongStroke(state.constructions,
        fieldPosition(attacker),fieldPosition(fighter),pending.trajectory,
        defense==="CONSTRUCTION"?command.constructionId:undefined);
      if(covers.length){
        const pressure=Math.max(1,Math.round(Math.max(0,power)*
          (skill?.damageMultiplier??1)*(skill?.finalMultiplier??1)));
        let remainingPressure=pressure;
        // Every measured cover consumes only what survived earlier covers.
        // If a fragile wall breaks, the residual can strike the next wall
        // before any damage reaches the character behind it.
        for(const {block:wall} of covers){
          if(remainingPressure<=0)break;
          const durability=wall.durability??0;
          const wear=Math.min(durability,remainingPressure);
          if(wear<=0)continue;
          wall.durability=Math.max(0,durability-wear);
          wall.hitCount=(wall.hitCount??0)+1;
          physicalCoverLabel??=wall.label;
          remainingPressure-=wear;
          if(wall.durability===0)
            state.constructions=state.constructions?.filter(c=>c.id!==wall.id);
          addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by:pending.by,
            against:wall.owner,constructionId:wall.id,damage:wear,contact:true,
            summary:wall.durability===0
              ?wall.label+" se rompió al interceptar la trayectoria del ataque."
              :wall.label+" interceptó el ataque físico y recibió "+wear+" de desgaste."});
        }
        const penetration=remainingPressure/pressure;
        damage=Math.max(0,Math.round(damage*penetration));
        noResistanceDamage=Math.max(0,Math.round(noResistanceDamage*penetration));
        mitigatedByResistance=Math.max(0,noResistanceDamage-damage);
        if(remainingPressure===0){contact=false;critical=false;}
      }
    }
    const actualHpDamage=Math.min(fighter.hp,damage);
    fighter.hp = Math.max(0, fighter.hp - damage);
    if(contact&&actualHpDamage>0)
      applyWearableOnConfirmedHpHit(state,by,actualHpDamage,pending.usesMagic);
    // Status effects from a real summon hit run only after geometric contact,
    // defense and actual HP damage have been fully resolved.
    if(summonedAttacker&&contact)
      resolveSummonContact(state,summonedAttacker,{
        target:by,contact,hpDamage:damage,randomRoll:rolls.critical,
        chosenStat:pending.chosenSummonStat,
        chosenStatusId:pending.chosenSummonStatusId,
      });
    if (contact && damage > 0 && displaced === 0 && !pending.usesMagic)
      displaced = knockbackMeters(attacker.strength, fighter.constitution, fighter.massKg) * (defense === "BLOCK" ? 0.25 : 1);
    if (displaced > 0) {
      if (defense === "REPEL" && damageScale < 1) {
        displaced=pushAwayOnField(state,attacker,fighter,displaced);
        // An involuntary displacement also breaks the continuity of a stroke.
        clearPhysicalStrokes(state,pending.by);
      } else {
        displaced=pushAwayOnField(state,fighter,attacker,displaced);
        clearPhysicalStrokes(state,by);
      }
    }
    if(summonedAttacker)
      summonedAttacker.fieldPosition={...fieldPosition(attacker)};
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT + attacker.spentTicks,(state.round-1)*LIMIT + fighter.spentTicks);
    const mirrorLabel=pending.mirrorId
      ?state.constructions?.find(c=>c.id===pending.mirrorId)?.label??"espejo mágico"
      :null;
    addLog(state,{kind:"RESOLVE",tick:state.tick,by:pending.by,against:by,damage,critical,
      mitigatedByResistance,contact,knockbackMeters:Math.round(displaced*100)/100,weaponIntegrity:fighter.weaponIntegrity,defense:exchange?"COUNTER":defense,
      constructionId:pending.mirrorId,mirrorShot:Boolean(pending.mirrorId),
      summonId:pending.summonId,
      mirrorOrigin:pending.mirrorId&&validArenaPoint(pending.trajectory[0])?{...pending.trajectory[0]}:undefined,
      materialAttackBonus:materialAttackBonus||undefined,
      skillId:pending.skill?.id,
      areaCenter:pending.usesMagic||pending.rangedPhysical||(pending.attackArea&&pending.attackArea.shape!=="SELF_FIELD")?pending.targetCenter:undefined,
      attackArea:pending.attackArea,
      areaAngleDegrees:isOrientedCombatArea(pending.attackArea)?pending.areaAngleDegrees:undefined,
      rangedPhysical:pending.rangedPhysical,
      predictedCenter:(pending.usesMagic&&defense==="DODGE"||pending.attackArea&&pending.attackArea.shape!=="SELF_FIELD"&&defense==="DODGE"||pending.rangedPhysical&&["DODGE","DEFLECT"].includes(defense))?command.predictedCenter:undefined,
      predictionMatched:validArenaPoint(pending.targetCenter)&&validArenaPoint(command.predictedCenter)?Math.hypot(pending.targetCenter.x-command.predictedCenter.x,pending.targetCenter.y-command.predictedCenter.y)<=(pending.rangedPhysical?0.09:0.19):undefined,
      summary:physicalCoverLabel
        ?physicalCoverLabel+" interceptó la trayectoria; daño al combatiente: "+damage+" HP"
        :mirrorLabel
        ?(avoided?fighter.name+" esquivó el rayo de "+mirrorLabel
          :"El rayo de "+mirrorLabel+" impactó a "+fighter.name+" ("+damage+" HP)")
        :avoided ? fighter.name + (pending.usesMagic?" escapó de la explosión":" evitó el ataque")
        :pending.attackArea?.shape==="SELF_FIELD"
          ?attacker.name+(contact?" alcanzó a ":" no alcanzó a ")+fighter.name+
            " con su barrido de "+pending.attackArea.radiusMeters+" m alrededor del usuario ("+damage+" HP)"
        :pending.attackArea?.shape==="STRIP"
          ?attacker.name+(contact?" alcanzó a ":" no alcanzó a ")+fighter.name+
            " con su franja de "+pending.attackArea.lengthMeters+" × "+pending.attackArea.widthMeters+" m ("+damage+" HP)"
        :pending.attackArea?.shape==="CONE"
          ?attacker.name+(contact?" alcanzó a ":" no alcanzó a ")+fighter.name+
            " con su cono de "+pending.attackArea.radiusMeters+" m y apertura "+pending.attackArea.openingDegrees+"° ("+damage+" HP)"
        :pending.attackArea?.shape==="SWEEP"
          ?attacker.name+(contact?" alcanzó a ":" no alcanzó a ")+fighter.name+
            " con su barrido en arco de "+pending.attackArea.innerRadiusMeters+" a "+pending.attackArea.outerRadiusMeters+" m ("+damage+" HP)"
        :pending.attackArea
          ?attacker.name+(contact?" alcanzó a ":" no alcanzó a ")+fighter.name+
            " con su ataque circular de "+pending.attackArea.radiusMeters+" m de radio ("+damage+" HP)"
          :attacker.name + (pending.usesMagic?" acertó con su explosión mágica a ":" impactó a ") + fighter.name + " (" + damage + " HP)"});
    // A mirror reflects only when a REAL area touches it. In particular an
    // approved single-target skill or mirror ray must never inherit the basic
    // explosion's 1.4 m footprint. SELF_FIELD checks measured world distance,
    // without inventing a center for the defender-facing 2D canvas.
    if(pending.usesMagic&&objectImpactArea){
      const casterPosition=fieldPosition(attacker);
      const mirrors=(state.constructions??[]).filter(c=>c.owner===by&&
        c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0&&
        constructionInAreaFootprint(c,objectImpactArea,pending.targetCenter,
          pending.areaAngleDegrees,casterPosition));
      const reflectionPower=pending.skill
        ?Math.max(1,Math.round(Math.max(0,power)*pending.skill.damageMultiplier*
         pending.skill.finalMultiplier))
        :Math.max(1,Math.round(3+5*Math.max(0,power)/(Math.max(0,power)+20)));
      for(const mirror of mirrors){
        const reflected=Math.max(0,Math.round(reflectionPower*mirror.mirror!.reflectionMultiplier));
        attacker.hp=Math.max(0,attacker.hp-reflected);
        addLog(state,{kind:"REFLECTION",tick:state.tick,by:mirror.owner,against:pending.by,
         constructionId:mirror.id,damage:reflected,contact:true,
         summary:mirror.label+" devolvió "+reflected+" puntos de daño mágico hacia "+attacker.name});
      }
    }
    // Physical areas damage enemy mirrors within their actual footprint,
    // including a SELF_FIELD around the caster. Other oriented shapes use
    // their exact defender-facing geometry, never an inferred world position.
    const physicalMirrorArea=!pending.usesMagic?pending.attackArea:undefined;
    if(physicalMirrorArea){
      const casterPosition=fieldPosition(attacker);
      const mirrors=(state.constructions??[]).filter(c=>c.owner===by&&
       c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0&&
       constructionInAreaFootprint(c,physicalMirrorArea,pending.targetCenter,
         pending.areaAngleDegrees,casterPosition));
      const direct=Math.max(1,Math.round(Math.max(0,power)*
       (pending.skill?.damageMultiplier??1)*(pending.skill?.finalMultiplier??1)));
      for(const mirror of mirrors){
       mirror.durability=Math.max(0,(mirror.durability??0)-direct);
       if(mirror.durability===0){
        state.constructions=state.constructions?.filter(c=>c.id!==mirror.id);
        state.mirrorRayQueue=state.mirrorRayQueue?.filter(id=>id!==mirror.id);
        addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by:pending.by,
         constructionId:mirror.id,damage:direct,contact:true,
         summary:attacker.name+" destruyó "+mirror.label+" con un ataque físico de área."});
       }
      }
    }
    // Area impacts persist independently from the defender's reaction.
    // A miss against the fighter can still damage a placed obstacle; an
    // successful dodge does not protect every construction within the blast.
    // Mirrors have a separate reflection/destruction path above, and the
    // actively selected defensive block has already paid its own wear.
    if(objectImpactArea){
      const area=objectImpactArea;
      const casterPosition=fieldPosition(attacker);
      const pressure=Math.max(1,Math.round(Math.max(0,power)*
       (pending.skill?.damageMultiplier??1)*(pending.skill?.finalMultiplier??1)));
      for(const block of [...(state.constructions??[])]){
        if(block.form!=="BLOCK"||block.id===interceptedAreaBlockId||
          !constructionInAreaFootprint(block,area,pending.targetCenter,
           pending.areaAngleDegrees,casterPosition))continue;
        const previous=block.durability??0;
        const wear=Math.min(previous,pressure);
        block.durability=Math.max(0,previous-wear);
        block.hitCount=(block.hitCount??0)+1;
        if(block.durability===0)
          state.constructions=state.constructions?.filter(c=>c.id!==block.id);
        addLog(state,{kind:"CONSTRUCTION",tick:state.tick,by:pending.by,
          against:block.owner,constructionId:block.id,damage:wear,contact:true,
          summary:block.durability===0
            ?block.label+" quedó destruido por el ataque de área ("+wear+" de integridad)."
            :block.label+" recibió "+wear+" de desgaste del ataque de área."});
      }
    }
    if(contact)dispatchCombatMicroEvent(state,by,"DAMAGE_RESOLVED",{
      MITIGATED_DAMAGE:mitigatedByResistance,APPLIED_DAMAGE:damage,
      UNPROTECTED_DAMAGE:noResistanceDamage,
    });
    // The counter was launched before the hit: it still lands if the
    // defender reaches zero HP. No second defense, extra initiative or
    // opportunity to counter the counter is granted in this exchange.
    if(exchange){
      for(const wear of exchange.constructionWear){
        const wall=state.constructions?.find(c=>c.id===wear.id);
        if(!wall)continue;
        wall.durability=Math.max(0,(wall.durability??0)-wear.wear);
        wall.hitCount=(wall.hitCount??0)+1;
        if(wall.durability===0)
          state.constructions=state.constructions?.filter(c=>c.id!==wall.id);
      }
      attacker.hp=Math.max(0,attacker.hp-exchange.damageToAttacker);
      fighter.hp=Math.max(0,fighter.hp-exchange.damageToDefender);
      if(exchange.attackerPosition){
       attacker.fieldPosition={...exchange.attackerPosition};
       attacker.positionMeters=exchange.attackerPositionMeters;
      }
      for(const event of exchange.events){
       const summary=event.kind==="ATTACK"
        ?event.summary.replace("; esperando reacción","")
        :event.summary;
       addLog(state,{...event,tick:state.tick,simultaneousCounter:true,
        summary:"Intercambio simultáneo: "+summary});
      }
    }
    state.pending = null;
    if(pending.movementOrder==="AFTER"&&pending.planarMove&&attacker.hp>0)
      finishCompositeStep(state,pending.by,pending.planarMove);
    if(fighter.hp<=0&&attacker.hp<=0)finishMutualEncounter(state);
    else if(fighter.hp<=0)finishEncounter(state,pending.by);
    else if(attacker.hp<=0)finishEncounter(state,by);
    if(state.status==="ACTIVE")beginNextMirrorRay(state);
    advanceRoundIfComplete(state);
    return state;
  }
  if (command.kind === "DEFEND") throw new Error("No existe un ataque pendiente.");
  if (!exchangedAttack&&!canAct(state,by)) throw new Error("Espera el movimiento del otro participante o el siguiente turno.");
  if(command.kind==="BOOST_KARMA")throw new Error("El boost de karma debe ser aprobado por el servidor.");
  if(command.kind==="USE_ITEM")throw new Error("El consumo de objetos debe ser aprobado por el servidor.");
  if (command.kind === "MOVE") {
    const maximum = Math.max(1,Math.round(normalize(fighter.race)/10));
    if (!finite(command.meters) || command.meters < 0 || command.meters > maximum)
      throw new Error("Desplazamiento fuera del alcance por acción: " + maximum + " m.");
    const direction = command.direction??"TOWARD";
    if (!["TOWARD","AWAY","WEAPON","VECTOR"].includes(direction)) throw new Error("Dirección inválida.");
    if(direction==="VECTOR"){
      const intended=validatePlanarMove(command.planarMove);
      const vector=distortChaosMove(state,by,intended);
      if(Math.abs(Math.hypot(intended.x,intended.y)-command.meters)>0.02)
        throw new Error("Los metros no coinciden con el trazo dibujado.");
      const start=fieldPosition(fighter);
      assertMovementClear(state.constructions,start,{x:start.x+vector.x,y:start.y+vector.y});
      moveFighterOnField(fighter,vector);clearPhysicalStrokes(state,by);
      spend(fighter,turnTicks(fighter));
      state.tick=Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
      addLog(state,{kind:"MOVE",tick:state.tick,by,movementDirection:"VECTOR",moveMeters:command.meters,
        fieldPosition:{...fieldPosition(fighter)},
        summary:fighter.name+" se desplazó "+command.meters.toFixed(2)+" m en el plano horizontal"});
      advanceRoundIfComplete(state);return state;
    }
    const dropped=activeDroppedWeapon(state,by,command.weaponSlot);
    if(direction==="WEAPON"&&!dropped)throw new Error("No hay un arma arrojada que recuperar.");
    const target=direction==="WEAPON"?dropped!.positionMeters:rival.positionMeters;
    const sign = Math.sign(target-fighter.positionMeters)||1;
    const magnitude = direction==="AWAY" ? -command.meters : Math.min(command.meters,Math.abs(target-fighter.positionMeters));
    const start=fieldPosition(fighter);
    const vector=distortChaosMove(state,by,{x:sign*magnitude,y:0});
    assertMovementClear(state.constructions,start,
      {x:start.x+vector.x,y:start.y+vector.y});
    moveFighterOnField(fighter,vector);
    let recoveredWeapon:string|undefined;
    if(direction==="WEAPON"&&dropped&&Math.abs(fighter.positionMeters-dropped.positionMeters)<0.2&&restoreWeapon(state,dropped)){
      recoveredWeapon=dropped.weapon.name;
    }
    if(magnitude!==0)clearPhysicalStrokes(state,by);
    spend(fighter,turnTicks(fighter));
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"MOVE",tick:state.tick,by,movementDirection:direction,moveMeters:command.meters,
      summary:recoveredWeapon?fighter.name+" recuperó "+recoveredWeapon+" tras desplazarse":fighter.name+" se desplazó "+command.meters+" m ("+direction+")"});
  } else if (command.kind === "WAIT") {
    fighter.spentTicks = LIMIT;
    fighter.spentAp = actionPoints(fighter.constitution);
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    addLog(state,{kind:"WAIT",tick:state.tick,by,summary:fighter.name+" finaliza su participación en el turno"});
  } else if (command.kind === "COMMAND_SUMMON") {
    orderSummon(state,by,command,rolls);
    return state;
  } else if (command.kind === "ATTACK") {
    if (!["CUT","BLUNT","PIERCE"].includes(command.attackType)) throw new Error("Tipo de ataque inválido.");
    if(command.movementOrder!==undefined&&command.planarMove===undefined)
      throw new Error("Elige un desplazamiento antes de combinar movimiento y ataque.");
    if(command.movementOrder!==undefined&&!["BEFORE","AFTER"].includes(command.movementOrder))
      throw new Error("El orden del movimiento no es válido.");
    if(command.planarMove!==undefined){
      const plannedSource=command.attackSource??defaultAttackSource(fighter);
      const plannedWeapon=weaponForSource(fighter,plannedSource);
      const weaponStrike=command.usesMagic!==true&&!!plannedWeapon&&
        (serverSkillRangeMeters===undefined||plannedSource==="MAIN_HAND"||plannedSource==="OFF_HAND");
      const actionTicks=turnTicks(fighter,weaponStrike?command.attackType:undefined);
      // AFTER must be checked at launch. A pending strike may only be
      // resolved by the defender, who cannot edit the attacker's movement;
      // discovering a blocked path during DEFEND would deadlock the fight.
      if(command.movementOrder==="AFTER"){
       const step=validatePlanarMove(command.planarMove);
       const from=fieldPosition(fighter);
       assertMovementClear(state.constructions,from,
        {x:from.x+step.x,y:from.y+step.y});
      }
      applyCompositeStep(state,by,command.planarMove,command.movementOrder??"BEFORE",actionTicks);
    }
    const points = command.trajectory?.length ? command.trajectory : [{x:0.1,y:0.5},{x:0.9,y:0.5}];
    if (!Array.isArray(points) || points.length < 2 || points.length > 80 || points.some(p => !safePoint(p)))
      throw new Error("Trayectoria inválida.");
    const magic=command.usesMagic===true;
    const source=command.attackSource??defaultAttackSource(fighter);
    if(!["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"].includes(source))throw new Error("Origen de ataque inválido.");
    const selectedWeapon=weaponForSource(fighter,source);
    if(command.usesMagic!==true&&selectedWeapon&&!combatWeaponOperational(selectedWeapon))
      throw new Error("El arma de "+(source==="OFF_HAND"?"la mano secundaria":"la mano principal")+
        " está rota. Usa otra mano, un puño o una patada.");
    if(command.targetConstructionId&&command.targetSummonId)
      throw new Error("Elige un solo objetivo para el ataque.");
    const targetedSummon=command.targetSummonId?
      state.summons?.find(s=>s.id===command.targetSummonId&&s.owner===other(by)):undefined;
    if(command.targetSummonId&&!targetedSummon)
      throw new Error("La criatura objetivo no existe o no pertenece al rival.");
    const targetedMirror=command.targetConstructionId?
      state.constructions?.find(c=>c.id===command.targetConstructionId&&
       c.owner===other(by)&&c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0):undefined;
    if(command.targetConstructionId&&!targetedMirror)
      throw new Error("El espejo elegido no existe o no pertenece al rival.");
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
    if(!magic&&!ranged&&!serverSkillArea) {
      const previous=physicalAttackStart(state,by,source);
      if(previous && Math.hypot(points[0].x-previous.x,points[0].y-previous.y)>0.000001)
        throw new Error("El ataque físico debe comenzar donde terminó el anterior. Muévete para cambiar el punto de inicio.");
    }
    if ((magic||(serverSkillArea&&serverSkillArea.shape!=="SELF_FIELD")) && !validArenaPoint(command.areaCenter))
      throw new Error("Marca el centro del ataque de área en el lienzo.");
    if(isOrientedCombatArea(serverSkillArea))validateAreaDirection(command.areaAngleDegrees);
    else if(command.areaAngleDegrees!==undefined)throw new Error("Dirección angular no permitida para este ataque.");
    const actualDistance=targetedSummon?
      Math.hypot(fieldPosition(fighter).x-targetedSummon.fieldPosition.x,
        fieldPosition(fighter).y-targetedSummon.fieldPosition.y):fieldDistance(fighter,rival);
    if (actualDistance>(serverSkillRangeMeters??(magic?BASIC_MAGIC_RANGE_METERS:effectiveWeaponReachMeters(fighter,thrown,source))))
      throw new Error(magic?"El objetivo está fuera del alcance mágico de 4 m.":"El objetivo está fuera del alcance máximo del ataque.");
    const distanceAtLaunch=actualDistance;
    // An approved skill owns its declared 2m/5m/etc. effective reach. Do
    // not apply an unarmed or equipped-weapon range penalty to that technique.
    const effectiveAtLaunch=serverSkillRangeMeters??
      (selectedWeapon?.effectiveRangeMeters??effectiveWeaponReachMeters(fighter,false,source));
    // Damage type does not determine how fast a kick or a spell is cast.
    // Basic attacks use the equipped weapon if selected; approved skills only
    // inherit weapon handling when they explicitly target that equipped hand.
    // In particular SELF_FIELD (Meia-lua) forces attackSource="KICK".
    const weaponStrike=!magic && selectedWeapon!==undefined &&
      (serverSkillRangeMeters===undefined || command.attackSource==="MAIN_HAND" || command.attackSource==="OFF_HAND");
    const attackTicks=turnTicks(fighter,weaponStrike?command.attackType:undefined);
    // The movement was charged one full neutral temporal window already;
    // only the slower weapon's excess ticks remain for a combined attack.
    spend(fighter,command.planarMove!==undefined?Math.max(0,attackTicks-turnTicks(fighter)):attackTicks);
    if(magic&&serverSkillRangeMeters===undefined)state.mana![by].current-=1;
    if(thrown&&selectedWeapon){
      const slot=source as "MAIN_HAND"|"OFF_HAND";
      state.droppedWeapons??=[];
      state.droppedWeapons.push({owner:by,slot,weapon:{...selectedWeapon},positionMeters:rival.positionMeters});
      if(slot==="MAIN_HAND")fighter.equippedWeapon=undefined;
      else fighter.offhandWeapon=undefined;
      if(state.physicalPathEnds?.[by])delete state.physicalPathEnds[by]![source];
    }
    if(!magic&&!ranged&&!serverSkillArea){
      state.physicalPathEnd??={};
      state.physicalPathEnd[by]={...points[points.length-1]};
      state.physicalPathEnds??={};
      state.physicalPathEnds[by]??={};
      state.physicalPathEnds[by]![source]={...points[points.length-1]};
    }
    if(targetedSummon){
      resolveTargetedSummonAttack(state,by,command,targetedSummon,rolls,mirrorSkill,serverSkillArea);
      if(command.movementOrder==="AFTER"&&command.planarMove&&fighter.hp>0)
        finishCompositeStep(state,by,command.planarMove);
      advanceRoundIfComplete(state);
      return state;
    }
    if(targetedMirror){
      // A mirror has no paid reaction: resolve object hits immediately.
      resolveTargetedMirrorAttack(state,by,command,targetedMirror,rolls,mirrorSkill,serverSkillArea);
      if(command.movementOrder==="AFTER"&&command.planarMove&&fighter.hp>0)
        finishCompositeStep(state,by,command.planarMove);
      advanceRoundIfComplete(state);
      return state;
    }
    state.pending = {by,against:other(by),attackType:command.attackType,
      trajectory:points,explicitTrajectory:Array.isArray(command.trajectory)&&command.trajectory.length>=2,
      directedMagicRay:magic&&mirrorSkill&&!serverSkillArea
        ?{from:fieldPosition(fighter),to:fieldPosition(rival)}:undefined,
      launchedAtTick:(state.round-1)*LIMIT+fighter.spentTicks,usesMagic:magic,rangedPhysical:ranged,thrownWeapon:thrown,attackSource:source,
      beyondEffectiveRange:!magic&&!thrown&&distanceAtLaunch>effectiveAtLaunch,
      targetCenter:magic||ranged||(serverSkillArea&&serverSkillArea.shape!=="SELF_FIELD")?command.areaCenter:undefined,
      areaHint:magic||ranged||(serverSkillArea&&serverSkillArea.shape!=="SELF_FIELD")?magicImpactZone(command.areaCenter!):undefined,
      attackArea:serverSkillArea,areaAngleDegrees:isOrientedCombatArea(serverSkillArea)?command.areaAngleDegrees:undefined,
      materialPerkBonus:weaponStrike?selectedWeapon?.materialPerkBonus:undefined,
      planarMove:command.planarMove?{...command.planarMove}:undefined,
      movementOrder:command.planarMove?command.movementOrder??"BEFORE":undefined};
    state.tick = Math.max(state.tick,(state.round-1)*LIMIT+fighter.spentTicks);
    const labels:Record<CombatAttackType,string>={CUT:"corte",BLUNT:"golpe contundente",PIERCE:"perforación"};
    addLog(state,{kind:"ATTACK",tick:state.tick,by,against:other(by),attackType:command.attackType,attackSource:source,
      usesMagic:magic,rangedPhysical:ranged,thrownWeapon:thrown,weaponName:selectedWeapon?.name,
      attackArea:serverSkillArea,manaCost:magic&&serverSkillRangeMeters===undefined?1:undefined,
      summary:serverSkillArea?.shape==="SELF_FIELD"
        ?fighter.name+" ejecutó un barrido a su alrededor (alcance "+serverSkillArea.radiusMeters+" m); esperando reacción"
        :serverSkillArea?.shape==="STRIP"?fighter.name+" lanzó una franja de "+serverSkillArea.lengthMeters+" × "+serverSkillArea.widthMeters+" m; esperando reacción"
        :serverSkillArea?.shape==="CONE"?fighter.name+" lanzó un cono de "+serverSkillArea.radiusMeters+" m y apertura "+serverSkillArea.openingDegrees+"°; esperando reacción"
        :serverSkillArea?.shape==="SWEEP"?fighter.name+" lanzó un barrido en arco de "+serverSkillArea.innerRadiusMeters+" a "+serverSkillArea.outerRadiusMeters+" m; esperando reacción"
        :serverSkillArea?fighter.name+" lanzó un ataque circular de "+serverSkillArea.radiusMeters+" m de radio; esperando reacción"
        :magic?fighter.name+" lanzó magia de "+labels[command.attackType]+"; esperando reacción"
        :ranged?fighter.name+" lanzó "+(thrown?"el arma ("+selectedWeapon?.name+") de ":"un proyectil físico de ")+labels[command.attackType]+"; esperando reacción"
        :fighter.name+" atacó con "+(selectedWeapon?.name??(source==="FIST_LEFT"?"puño izquierdo":source==="KICK"?"patada":"puño derecho"))+" ("+labels[command.attackType]+")"+"; esperando reacción"});
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
 aim:{requestId:string;planarMove?:Point;movementOrder?:"BEFORE"|"AFTER";constructionFieldPoint?:Point;constructionHeightMeters?:number;trajectory?:Point[];areaCenter?:Point;areaAngleDegrees?:number;attackSource?:PhysicalAttackSource;
  constructionForm?:"FIELD"|"BLOCK"|"DECOR";constructionLabel?:string;targetConstructionId?:string;targetSummonId?:string;
  constructionFootprintRadiusMeters?:number;constructionSolidHeightMeters?:number;
  chargesToSpend?:number},
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
  const selfField=plan.attackArea?.shape==="SELF_FIELD";
  if(selfField&&aim.targetConstructionId)
   throw new Error("El barrido alrededor del usuario no permite elegir un objeto como epicentro.");
  next=applyCombatCommand(original,by,{
   kind:"ATTACK",attackType:plan.attackType,usesMagic:plan.usesMagic,
   planarMove:aim.planarMove,movementOrder:aim.movementOrder,
   trajectory:selfField?undefined:aim.trajectory,
   areaCenter:selfField?undefined:aim.areaCenter,
   areaAngleDegrees:isOrientedCombatArea(plan.attackArea)?aim.areaAngleDegrees:undefined,
   attackSource:selfField?"KICK":aim.attackSource,
   targetConstructionId:selfField?undefined:aim.targetConstructionId,
   targetSummonId:selfField?undefined:aim.targetSummonId,
  },rolls,plan.rangeMeters,{
   id:plan.id,name:plan.name,damageMultiplier:plan.damageMultiplier,finalMultiplier:plan.finalMultiplier,
  },plan.attackArea);
  if(!next.pending&&!aim.targetConstructionId&&!aim.targetSummonId)throw new Error("No se pudo preparar el ataque de habilidad.");
  if(next.pending)next.pending.skill={
   id:plan.id,name:plan.name,damageMultiplier:plan.damageMultiplier,
   defenseFactor:plan.defenseFactor,finalMultiplier:plan.finalMultiplier,
   damageElement:plan.damageElement,
  };
  const event=next.pending?next.log.at(-1):next.log.slice().reverse().find(x=>
    x.kind==="ATTACK"&&x.by===by&&x.skillId===plan.id);
  if(event){
   event.skillId=plan.id;event.manaCost=plan.cost;event.skillName=plan.name;
   if(next.pending)event.summary=next.actors[by].name+" lanzó "+plan.name+"; esperando reacción";
   const historical=next.narrativeHistory?.filter(x=>x.kind==="ATTACK"&&x.by===by).at(-1);
   if(historical){historical.skillId=plan.id;historical.manaCost=plan.cost;
    historical.skillName=plan.name;historical.summary=event.summary;}
  }
  }else if(plan.category==="FUSION") {
   const fusion=plan.fusion;
   if(!fusion)throw new Error("La habilidad no tiene una fusión ejecutable.");
   if(aim.planarMove||aim.trajectory||aim.areaCenter||aim.targetSummonId||
     aim.targetConstructionId||aim.constructionFieldPoint||aim.chargesToSpend!==undefined)
     throw new Error("La fusión usa las invocaciones existentes, sin trayectoria ni objetivo externo.");
   next=structuredClone(original);
   const owner=next.actors[by],origin=fieldPosition(owner);
   const selected=fusion.sourceEntityKeys.map(entityKey=>{
     const creature=next.summons?.find(s=>s.owner===by&&s.entityKey===entityKey&&
       s.integrity>0&&s.expiresAtRound>next.round);
     if(!creature)throw new Error("Falta una criatura activa necesaria para la fusión: "+entityKey);
     const dist=Math.hypot(creature.fieldPosition.x-origin.x,
       creature.fieldPosition.y-origin.y);
     if(dist>creature.controlRangeMeters+1e-8||
       dist>fusion.summon.controlRangeMeters+1e-8)
       throw new Error("Una criatura requerida está fuera del control de la fusión.");
     return creature;
   });
   if(next.summons?.some(s=>s.owner===by&&s.entityKey===fusion.summon.entityKey))
     throw new Error("La criatura fusionada ya existe en este encuentro.");
   if(new Set(selected.map(s=>s.id)).size!==selected.length)
     throw new Error("Las criaturas de origen de la fusión deben ser distintas.");
   const consumedIds=new Set(selected.map(s=>s.id));
   const integrityLink=fusion.summon.links.find(x=>x.destStat==="INTEGRITY")!;
   const integrity=Math.max(1,resolveSummonStat(owner,integrityLink));
   const result:CombatSummon={
     id:by+":"+plan.id+":"+aim.requestId+":FUSION",
     owner:by,sourceSkillId:plan.id,
     entityKey:fusion.summon.entityKey,label:fusion.summon.label,
     // Materializes where one of the actual participants stood.
     fieldPosition:{...selected[0].fieldPosition},createdRound:next.round,
     expiresAtRound:next.round+fusion.summon.durationTurns,
     controlRangeMeters:fusion.summon.controlRangeMeters,
     maintenanceMana:fusion.summon.maintenanceMana,
     integrity,hitCount:0,hitLimit:fusion.summon.hitLimit,
     links:structuredClone(fusion.summon.links),
     behavior:structuredClone(fusion.summon.behavior),
     contactEffects:[],charges:{},chargesMigrated:true,
     fusedFrom:selected.map(x=>x.id),
     chaosField:fusion.chaosField?structuredClone(fusion.chaosField):undefined
   };
   // Migrate old charge wallets before the sources disappear.
   ensureCombatChargePool(next,by);
   next.summons=[...(next.summons??[]).filter(x=>!consumedIds.has(x.id)),result];
   spend(owner,turnTicks(owner));
   next.tick=Math.max(next.tick,(next.round-1)*LIMIT+owner.spentTicks);
   // Charge before advancing a round and paying the fused creature's upkeep.
   next.mana![by].current-=plan.cost;
   addLog(next,{kind:"SUMMON",tick:next.tick,by,skillId:plan.id,
     skillName:plan.name,summonId:result.id,manaCost:plan.cost,
     summary:owner.name+" fusionó "+selected.map(x=>x.label).join(", ")+
       " en "+result.label+(result.chaosField?
         " y abrió un campo de distorsión de "+result.chaosField.radiusMeters+" m.":".")});
   advanceRoundIfComplete(next);
  }else if(plan.category==="CHARGE_BUFF") {
   const buff=plan.chargeBuff;
   if(!buff)throw new Error("La habilidad no incluye una potenciación válida.");
   if(aim.planarMove||aim.trajectory||aim.areaCenter||aim.targetSummonId||
      aim.targetConstructionId||aim.constructionFieldPoint)
     throw new Error("La potenciación es personal y no admite movimiento ni objetivos externos.");
   const count=aim.chargesToSpend;
   if(!Number.isSafeInteger(count)||count===undefined||
      count<buff.minCharges||count>buff.maxCharges)
     throw new Error("Elige entre "+buff.minCharges+" y "+buff.maxCharges+" cargas.");
   next=structuredClone(original);
   spendCombatCharges(next,by,buff.accumulator,count);
   const owner=next.actors[by],factor=1+buff.perChargePercent*count/100;
   if(buff.stats.length>8||(next.summonStatuses?.length??0)+buff.stats.length>100)
     throw new Error("No hay capacidad para aplicar más estados temporales.");
   for(const [index,stat] of buff.stats.entries()){
     applySummonStatus(next,{
       id:"CHARGE:"+by+":"+plan.id+":"+aim.requestId+":"+index,
       sourceSummonId:"SKILL:"+plan.id,by,target:by,stat,
       operation:"MULTIPLIER",value:factor,durationTurns:buff.durationTurns,
     });
   }
   spend(owner,turnTicks(owner));
   next.tick=Math.max(next.tick,(next.round-1)*LIMIT+owner.spentTicks);
   // Pay the activation cost before an automatic round advance.
   next.mana![by].current-=plan.cost;
   addLog(next,{kind:"SKILL",tick:next.tick,by,skillId:plan.id,skillName:plan.name,
     manaCost:plan.cost,summary:owner.name+" activó "+plan.name+
       " consumiendo "+count+" carga(s) de "+buff.accumulator+
       " y obtuvo ×"+factor.toFixed(2)+" durante "+buff.durationTurns+" turnos."});
   advanceRoundIfComplete(next);
  }else if(plan.category==="SUMMON") {
  if(!plan.summons?.length)throw new Error("La habilidad no contiene invocaciones ejecutables.");
  if(aim.planarMove||aim.areaCenter||aim.constructionFieldPoint||aim.trajectory)
    throw new Error("La invocación usa una formación alrededor del usuario, sin trayectoria ni epicentro.");
  next=structuredClone(original);
  const owner=next.actors[by],origin=fieldPosition(owner);
  if((next.summons?.length??0)+plan.summons.length>30)
    throw new Error("Demasiadas invocaciones simultáneas en el encuentro.");
  const fresh:CombatSummon[]=[];
  const reservedKeys=new Set((next.summons??[]).filter(x=>x.owner===by).map(x=>x.entityKey));
  for(const [index,template] of plan.summons.entries()){
    if(reservedKeys.has(template.entityKey))
      throw new Error("La invocación "+template.label+" ya está activa.");
    reservedKeys.add(template.entityKey);
    const totalIndex=(next.summons?.length??0)+index;
    let position:Point|undefined;
    for(let attempt=0;attempt<16;attempt++){
      // Deterministic spiral in world metres, checked against physical obstacles.
      const theta=(totalIndex+attempt*0.618)*2.399963229728653;
      const radius=0.48+0.14*(attempt%3);
      const point={x:origin.x+radius*Math.cos(theta),y:origin.y+radius*Math.sin(theta)};
      try{assertMovementClear(next.constructions,origin,point);position=point;break;}
      catch{ /* Alternative free directions; never create inside a wall. */ }
    }
    if(!position)throw new Error("No hay un lugar libre para materializar a "+template.label+".");
    const integrityLink=template.links.find(link=>link.destStat==="INTEGRITY")!;
    const integrity=Math.max(1,integrityLink.mode==="FIXED"
      ?integrityLink.value:owner.physicalDefense*integrityLink.factor);
    fresh.push({
      id:by+":"+plan.id+":"+aim.requestId+":"+index,
      owner:by,sourceSkillId:plan.id,entityKey:template.entityKey,label:template.label,
      fieldPosition:position,createdRound:next.round,
      expiresAtRound:next.round+template.durationTurns,
      controlRangeMeters:template.controlRangeMeters,
      maintenanceMana:template.maintenanceMana,
      integrity,hitCount:0,hitLimit:template.hitLimit,
      links:structuredClone(template.links),behavior:structuredClone(template.behavior),
      contactEffects:structuredClone(template.contactEffects),charges:{},chargesMigrated:true,
    });
  }
  next.summons=[...(next.summons??[]),...fresh];
  spend(owner,turnTicks(owner));
  next.tick=Math.max(next.tick,(next.round-1)*LIMIT+owner.spentTicks);
  // Charge activation BEFORE possible round-start upkeep.
  next.mana![by].current-=plan.cost;
  addLog(next,{kind:"SKILL",tick:next.tick,by,skillId:plan.id,skillName:plan.name,
    manaCost:plan.cost,summary:owner.name+" invocó "+fresh.map(x=>x.label).join(", ")+
      " ("+fresh.length+" criaturas, "+plan.cost+" maná)."});
  advanceRoundIfComplete(next);
 }else if(plan.category==="CONSTRUCTION") {
  if(!plan.construction)throw new Error("La habilidad no tiene una creación configurada.");
  const point=validateConstructionPlacement(aim.areaCenter);
  if(aim.planarMove!==undefined)
   throw new Error("Combinar movimiento y creación requiere una regla específica.");
  next=structuredClone(original);
  const ownerPosition=next.actors[by];
  const fieldPoint=aim.constructionFieldPoint===undefined?undefined:
   pointFromFieldView(ownerPosition,aim.constructionFieldPoint);
  if(fieldPoint&&Math.hypot(fieldPoint.x-fieldPosition(ownerPosition).x,
    fieldPoint.y-fieldPosition(ownerPosition).y)>plan.rangeMeters+1e-8)
   throw new Error("La construcción está fuera del alcance en el plano horizontal.");
  if(aim.constructionHeightMeters!==undefined&&(!Number.isFinite(aim.constructionHeightMeters)||
    aim.constructionHeightMeters<0||aim.constructionHeightMeters>10))
   throw new Error("La altura de construcción debe estar entre 0 y 10 m.");
  const owner=next.actors[by];
  const existing=next.constructions??[];
  if(plan.mirror){
    if(aim.constructionForm&&aim.constructionForm!=="FIELD")
      throw new Error("Un espejo no puede configurarse como bloque o decoración.");
    if(existing.length>=120)throw new Error("Hay demasiadas construcciones activas.");
    const userLabel=typeof aim.constructionLabel==="string"?aim.constructionLabel.trim():"";
    if(userLabel.length>60||/[\x00-\x1f]/.test(userLabel))
      throw new Error("Nombre de espejo inválido.");
    if(fieldDistance(owner,next.actors[other(by)])>plan.rangeMeters)
      throw new Error("El objetivo está fuera del alcance de invocación del espejo.");
    const mirror:CombatConstruction={
      id:by+"-"+plan.id+"-"+next.round+"-"+next.tick+"-"+existing.length,
      owner:by,sourceSkillId:plan.id,material:"MIRROR",form:"MIRROR",
      label:userLabel||plan.construction.label,center:point,createdRound:next.round,
      fieldPosition:fieldPoint,heightMeters:aim.constructionHeightMeters,
      // The canvas is a defender-facing placement plane; anchor the mirror
      // at that target's world depth, not at the moving caster's position.
      positionMeters:fieldPoint?.x??next.actors[other(by)].positionMeters,
      tangible:true,durability:plan.mirror.durability,
      mirror:{rayMultiplier:plan.mirror.rayMultiplier,reflectionMultiplier:plan.mirror.reflectionMultiplier,
       rangeMeters:plan.rangeMeters,attackType:"PIERCE"},
    };
    next.constructions=[...existing,mirror];
    // The cast itself creates the first magic piercing attack for one PA.
    next=applyCombatCommand(next,by,{kind:"ATTACK",attackType:"PIERCE",
     usesMagic:true,areaCenter:{...targetHitboxCenter},
     trajectory:mirrorRayTrajectory(mirror)},rolls,plan.rangeMeters);
    if(!next.pending)throw new Error("No se pudo lanzar el primer rayo del espejo.");
    next.pending.mirrorId=mirror.id;
    // A mirror ray starts at the mirror, never from the summoner's body.
    next.pending.directedMagicRay=mirror.fieldPosition?{
      from:{...mirror.fieldPosition},to:fieldPosition(next.actors[other(by)])}:undefined;
    next.pending.skill={id:plan.id,name:plan.name+" · Rayo",
     damageMultiplier:plan.mirror.rayMultiplier,defenseFactor:1,finalMultiplier:1};
    const event=next.log.at(-1);
    if(event){
      event.skillId=plan.id;event.skillName=plan.name;event.constructionId=mirror.id;
      event.mirrorShot=true;event.manaCost=plan.cost;
      event.summary=owner.name+" invocó "+mirror.label+" y lanzó un rayo mágico de perforación.";
      const historical=next.narrativeHistory?.filter(x=>x.kind==="ATTACK"&&x.by===by).at(-1);
      if(historical){historical.skillId=plan.id;historical.skillName=plan.name;
       historical.constructionId=mirror.id;historical.mirrorShot=true;historical.summary=event.summary;}
    }
  }else{
  if(existing.length>=120)throw new Error("Hay demasiadas construcciones activas.");
  const form=resolveConstructionForm(plan.construction.material,aim.constructionForm,
   existing.some(x=>x.owner===by&&x.sourceSkillId===plan.id&&x.form==="FIELD"));
  const userLabel=typeof aim.constructionLabel==="string"?aim.constructionLabel.trim():"";
  if(userLabel.length>60||/[\x00-\x1f]/.test(userLabel))throw new Error("Nombre de construcción inválido.");
  const collider=form==="BLOCK"
    ?validatePhysicalCollider(aim.constructionFootprintRadiusMeters,
       aim.constructionSolidHeightMeters,aim.constructionHeightMeters,fieldPoint)
    :undefined;
  if(form!=="BLOCK"&&(aim.constructionFootprintRadiusMeters!==undefined||
    aim.constructionSolidHeightMeters!==undefined))
    throw new Error("Solo un bloque material puede tener volumen físico sólido.");
  if(collider&&fieldPoint&&aim.constructionHeightMeters===0){
    for(const occupant of Object.values(next.actors))
      if(Math.hypot(fieldPoint.x-fieldPosition(occupant).x,
        fieldPoint.y-fieldPosition(occupant).y)<collider.radiusMeters)
        throw new Error("No puedes crear un bloque sólido dentro de un combatiente.");
  }
  const resistance=plan.creationPassive;
  const baseRes=resistance
    ?Math.max(0,Number((owner as unknown as Record<string,number>)[resistance.resistance.baseStat]??owner.magicDefense)):0;
  const construction:CombatConstruction={
    id:by+"-"+plan.id+"-"+next.round+"-"+next.tick+"-"+existing.length,
    owner:by,sourceSkillId:plan.id,material:plan.construction.material,form,
    label:userLabel||plan.construction.label,center:point,createdRound:next.round,
    fieldPosition:fieldPoint,heightMeters:aim.constructionHeightMeters,
    footprintRadiusMeters:collider?.radiusMeters,solidHeightMeters:collider?.solidHeightMeters,
    tangible:form==="BLOCK",durability:form==="BLOCK"?Math.max(1,Math.round(baseRes)):undefined,
    passive:resistance?structuredClone(resistance):undefined,
  };
  next.constructions=[...existing,construction];
  spend(owner,turnTicks(owner)); // casting is one action
  next.tick=Math.max(next.tick,(next.round-1)*LIMIT+owner.spentTicks);
  addLog(next,{kind:"SKILL",tick:next.tick,by,skillId:plan.id,skillName:plan.name,
    constructionId:construction.id,manaCost:plan.cost,
    summary:owner.name+" creó "+construction.label+" ("+form+")"+
     (resistance?" y activó automáticamente la pasiva de resistencia":"")});
  advanceRoundIfComplete(next);
  }
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
   skillName:plan.name,healingPoints:plan.healing??undefined,
   summary:actor.name+" usó "+plan.name+(plan.healing?" y recuperó hasta "+plan.healing+" HP":"")});
  advanceRoundIfComplete(next);
 }
 if(plan.category!=="SUMMON"&&plan.category!=="CHARGE_BUFF"&&plan.category!=="FUSION")next.mana![by].current-=plan.cost;
 next.skillCooldowns??={};
 next.skillCooldowns[by]??={};
 next.skillCooldowns[by]![key]=plan.oncePerCombat?-1:
   (plan.cooldownRounds>0?original.round+plan.cooldownRounds+1:0);
 next.processedSkillRequests=[...(next.processedSkillRequests??[]),aim.requestId].slice(-100);
 return next;
}
