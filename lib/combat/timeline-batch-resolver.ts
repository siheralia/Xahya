/**
 * Atomic commit stage for the v2 timeline. All strikes in the same completion
 * batch are evaluated against the SAME pre-impact snapshot. The scheduler
 * never applies these effects while the other actor is still choosing.
 *
 * The caller is responsible for validating attacks, collision, skills,
 * defenses, equipment, permissions and server dice BEFORE building an effect.
 * This module commits already-authorized HP and equipment wear, not combat
 * formulas; it does not execute any untrusted client-supplied effect.
 */
import type {CombatState,CombatLog,Side,Point,PhysicalAttackSource} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {timelineRoundOf} from "./action-timeline.ts";
import {narrateCombat,COMBAT_NARRATIVE_VERSION} from "./narration.ts";
import {applySummonStatus,expireSummonStatuses,reconcileSummonStatusStat,
 invertSummonStatus,isDebuffStatus} from "./summon-status.ts";
import {spendCombatCharges,creditCombatCharge} from "./charge-pools.ts";
import type {CombatBuffStat} from "./skill-casting.ts";
import type {CombatConstruction} from "./constructs.ts";
import {measuredBlock} from "./physical-obstacles.ts";
import type {CombatSummon} from "./summons.ts";
import {upkeepTimelineSummonsAtRound} from "./timeline-summon-world.ts";
import {applyWeaponSelfRepairAtRoundStart} from "./turn-engine.ts";
import {applyTimelineEquipmentWear} from "./timeline-equipment-replay.ts";
import type {StatusStat} from "./summon-status.ts";
import type {TimelineBatch,TimelineEvent} from "./action-timeline.ts";
import {physicalProjectileFlightTicks,type TimelineFlyingProjectile}
 from "./timeline-projectile-flight.ts";
import {turnTicks,weaponForSource} from "./turn-engine.ts";

type CopyWear={owner:Side;characterItemId:number;amount:number};
export type AuthorizedTimelineEffect={
  eventId:string;
  /** Damage dealt to the target, already computed from the common snapshot. */
  hpDamage?:Partial<Record<Side,number>>;
  /** Heal values are resolved at the same instant as damage. */
  hpHealing?:Partial<Record<Side,number>>;
  equipmentWear?:CopyWear[];
  /** Launch stores an independent frozen projectile, no immediate damage. */
  projectilesLaunched?:TimelineFlyingProjectile[];
  /** Impact consumes one launched projectile, with optional wear on its copy. */
  projectilesImpacted?:Array<{id:string;owner:Side;weaponWear:number}>;
  /** A thrown equipped copy lands at impact, preserving approved wear. */
  weaponThrows?:Array<{owner:Side;characterItemId:number;
    slot:"MAIN_HAND"|"OFF_HAND";landing:Point}>;
  /** Recover a specific existing ground weapon after a validated MOVE.
   * The batch restores its post-impact copy, never a client-supplied item. */
  weaponRecoveries?:Array<{owner:Side;characterItemId:number;
    slot:"MAIN_HAND"|"OFF_HAND"}>;
  /** Physical structures take atomic per-hit wear with shared snapshot rules. */
  constructionWear?:Array<{id:string;amount:number;hitCountDelta:number}>;
  /** Only server-reviewed CONSTRUCTION casts can create an object. */
  constructionsCreated?:CombatConstruction[];
  summonsCreated?:CombatSummon[];
  /** A trusted FUSION can retire only concrete preexisting, owned sources.
   * Source actions on the same tick still finish before their retirement. */
  summonsConsumed?:Array<{id:string;owner:Side}>;
  summonUpdates?:Array<{id:string;owner:Side;
    fieldPosition?:Point;behaviorMode?:CombatSummon["behavior"]["mode"];
    targetId?:string;autoNextTick?:number;autoRound?:number;autoSpentAp?:number}>;
  /** Multiple concurrent creature hits add to target integrity/hit count. */
  summonImpacts?:Array<{id:string;owner:Side;damage:number;hitCountDelta:number}>;
  /** Statuses produced by the official approved creature-contact resolver. */
  summonInversions?:Array<{id:string;sourceSummonId:string;
    owner:Side;target:Side;chargeAccumulator?:string}>;
  summonContactStatuses?:Array<{id:string;sourceSummonId:string;by:Side;
    target:Side;stat:StatusStat;operation:"BONUS"|"MULTIPLIER";
    value:number;durationTurns:number}>;

  /** Consume exactly one official encounter-stock unit from a server-compiled
   * catalog copy. Never trust amounts or quantities sent by the player.
   */
  consumableUses?:Array<{owner:Side;itemId:number;characterItemId?:number}>;
  /** Charge spending is owner-scoped and only occurs at the skill deadline. */
  combatChargeSpends?:Array<{owner:Side;accumulator:string;amount:number}>;
  /** Only trusted, authorized resolution may spend encounter-local mana. */
  manaSpent?:Partial<Record<Side,number>>;
  manaRestored?:Partial<Record<Side,number>>;
  /** Reviewed stat bonuses from an approved self-only SUPPORT plan. */
  statBonuses?:Array<{owner:Side;skillId:number;skillName:string;
    stat:CombatBuffStat;value:number;durationTurns:number}>;
  /** Approved personal status with the same stacking semantics as V1. */
  selfStatuses?:Array<{owner:Side;id:string;skillId:number;stat:StatusStat;
    operation:"BONUS"|"MULTIPLIER";value:number;durationTurns:number}>;
  /** Staff-approved enemy CONTACT / HP_DAMAGE rider, verified in a V1
   * shadow after the real hit. No client may supply one to the session API.
   */
  hostileStatuses?:Array<{owner:Side;target:Side;id:string;skillId:number;
    stat:StatusStat;operation:"BONUS"|"MULTIPLIER";value:number;durationTurns:number}>;
  /** -1 = once per combat; 0 = available; others are next allowed round. */
  skillCooldowns?:Array<{owner:Side;skillId:number;nextAvailableRound:number}>;
  /** Approved relative world displacement, e.g. a MOVE or measured knockback.
   * Concurrent displacement vectors add against the pre-impact coordinates. */
  positionDelta?:Partial<Record<Side,Point>>;
  /** Changing world position breaks a continuous physical stroke. */
  resetPhysicalStrokes?:Side[];
  /** Last measured endpoint for a hand / kick, unless interrupted by movement. */
  physicalStrokes?:Array<{owner:Side;source:PhysicalAttackSource;end:Point}>;
  /** Server-produced event log, not a command-supplied summary. */
  logs?:CombatLog[];
};

const SIDES:Side[]=["PLAYER","NPC"];
const finiteNonnegative=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1_000_000;
const copyKey=(owner:Side,id:number)=>owner+":"+id;
const SIDES_SET=new Set<string>(SIDES);
const validPosition=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  Math.abs(p.x)<=1_000_000&&Math.abs(p.y)<=1_000_000;
const validStroke=(p:Point)=>validPosition(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const buffStats=new Set<string>([
 "physicalAttack","magicAttack","physicalDefense","magicDefense","precision","dodge"
]);
const validSide=(side:Side)=>SIDES_SET.has(side);
const validDuration=(duration:number)=>Number.isSafeInteger(duration)&&
 duration>=1&&duration<=20;

/** Expire short-lived support effects at EACH real 100-tick boundary, before
 * any action finishing at that boundary or later can read its combat stats.
 * Both concurrent event evaluators must see the SAME post-expiration snapshot.
 * No periodic summon/repair effects are executed here: those require the
 * full, separate V2 temporal-events migration.
 */
export function prepareTimelineImpactSnapshot(
 original:CombatState,batch:TimelineBatch,
):CombatState {
 if(original.status!=="ACTIVE"||batch.state.nowTick!==batch.atTick||
   !Number.isSafeInteger(batch.atTick)||batch.atTick<original.tick)
   throw new Error("El lote temporal no pertenece a un combate activo.");
 const expected:number[]=[];
 for(let boundary=(Math.floor(original.tick/100)+1)*100;boundary<=batch.atTick;boundary+=100)
   expected.push(boundary);
 if(expected.length!==batch.crossedRoundBoundaries.length||
   expected.some((v,i)=>v!==batch.crossedRoundBoundaries[i]))
   throw new Error("Las fronteras del tiempo compartido no corresponden al lote.");
 const state=structuredClone(original);
 for(const crossing of expected){
   state.round=timelineRoundOf(crossing);
   state.tick=crossing;
   const expiring=(state.skillBonuses??[]).filter(x=>x.expiresAtRound<=state.round);
   for(const bonus of expiring){
     const fighter=state.actors[bonus.by];
     fighter[bonus.stat]=Math.max(0,fighter[bonus.stat]-bonus.value);
   }
   state.skillBonuses=(state.skillBonuses??[]).filter(x=>x.expiresAtRound>state.round);
   expireSummonStatuses(state);
   for(const bonus of expiring)
     reconcileSummonStatusStat(state,bonus.by,bonus.stat);
   upkeepTimelineSummonsAtRound(state,crossing);
   state.narrativeHistory??=[...state.log];
   const roundEntry:CombatLog={kind:"ROUND",tick:crossing,
     by:"PLAYER",summary:"Comienza el turno "+state.round};
   state.narrativeHistory.push(roundEntry);
   state.log.push(roundEntry);
   // The canonical V1 round contract: upkeep first, then passive item
   // repair. Failed formula configs disable ONLY that item, not the fight.
   state.itemRepairsThisRound=[];
   for(const side of SIDES)
     applyWeaponSelfRepairAtRoundStart(state,side);
 }
 return state;
}

/** Simultaneous damage and healing: a lethal blow does not cancel a second
 * attack that also finished on this tick. Both can fall to zero HP.
 *
 * This atomic stage deliberately rejects unsupported world modifications:
 * positions, inventories, buffs, construction durability, status effects and
 * mana require their own conflict-safe effect types, not a silent overwrite
 * of one combatant's snapshot.
 */
export function commitAuthorizedTimelineBatch(
 original:CombatState,batch:TimelineBatch,
 effects:readonly AuthorizedTimelineEffect[],
):CombatState {
 if(original.status!=="ACTIVE"||batch.state.nowTick!==batch.atTick||!Number.isSafeInteger(batch.atTick)||
   batch.atTick<original.tick)
   throw new Error("El lote temporal no pertenece a un combate activo.");
 const ids=new Set(batch.events.map(e=>e.id));
 if(ids.size!==batch.events.length||effects.length!==batch.events.length||
   batch.events.some(e=>e.endsAtTick!==batch.atTick||e.status!=="RESOLVED"))
   throw new Error("Cada evento temporal debe tener exactamente un resultado autorizado.");
 const found=new Set<string>();
 const snapshot=prepareTimelineImpactSnapshot(original,batch);
 const damages:Record<Side,number>={PLAYER:0,NPC:0};
 const healing:Record<Side,number>={PLAYER:0,NPC:0};
 const wear=new Map<string,{owner:Side;characterItemId:number;amount:number}>();
 const launches:TimelineFlyingProjectile[]=[];
 const impacts:NonNullable<AuthorizedTimelineEffect["projectilesImpacted"]>=[];
 const throws:NonNullable<AuthorizedTimelineEffect["weaponThrows"]>=[];
 const recoveries:NonNullable<AuthorizedTimelineEffect["weaponRecoveries"]>=[];
 const constructionWear=new Map<string,{id:string;amount:number;hitCountDelta:number}>();
 const constructionsCreated:CombatConstruction[]=[];
 const consumableUses:NonNullable<AuthorizedTimelineEffect["consumableUses"]>=[];
 const combatChargeSpends:NonNullable<AuthorizedTimelineEffect["combatChargeSpends"]>=[];
 const moved:Record<Side,Point>={PLAYER:{x:0,y:0},NPC:{x:0,y:0}};
 const clears=new Set<Side>();
 const strokes:Array<{owner:Side;source:PhysicalAttackSource;end:Point}>=[];
 const logs:CombatLog[]=[];
 const manaSpent:Record<Side,number>={PLAYER:0,NPC:0};
 const manaRestored:Record<Side,number>={PLAYER:0,NPC:0};
 const statBonuses:NonNullable<AuthorizedTimelineEffect["statBonuses"]>=[];
 const selfStatuses:NonNullable<AuthorizedTimelineEffect["selfStatuses"]>=[];
 const summonsCreated:CombatSummon[]=[];
 const summonsConsumed:NonNullable<AuthorizedTimelineEffect["summonsConsumed"]>=[];
 const summonUpdates:NonNullable<AuthorizedTimelineEffect["summonUpdates"]>=[];
 const summonImpacts=new Map<string,{id:string;owner:Side;damage:number;hitCountDelta:number}>();
 const summonContactStatuses:NonNullable<AuthorizedTimelineEffect["summonContactStatuses"]>=[];
 const summonInversions:NonNullable<AuthorizedTimelineEffect["summonInversions"]>=[];
 const hostileStatuses:NonNullable<AuthorizedTimelineEffect["hostileStatuses"]>=[];
 const skillCooldowns:NonNullable<AuthorizedTimelineEffect["skillCooldowns"]>=[];
 for(const effect of effects){
   if(!ids.has(effect.eventId)||found.has(effect.eventId))
     throw new Error("Resultado temporal duplicado o ajeno al lote.");
   found.add(effect.eventId);
   for(const side of SIDES){
     const damage=effect.hpDamage?.[side]??0;
     const heal=effect.hpHealing?.[side]??0;
     if(!finiteNonnegative(damage)||!finiteNonnegative(heal))
       throw new Error("Daño o curación temporal inválida.");
     damages[side]+=damage;healing[side]+=heal;
     const spent=effect.manaSpent?.[side]??0;
     const restored=effect.manaRestored?.[side]??0;
     if(!Number.isSafeInteger(spent)||spent<0||spent>1_000_000||
       !Number.isSafeInteger(restored)||restored<0||restored>1_000_000)
       throw new Error("Coste o restauración de maná inválidos.");
     manaSpent[side]+=spent;manaRestored[side]+=restored;
     if(!Number.isSafeInteger(manaSpent[side])||!Number.isSafeInteger(manaRestored[side]))
       throw new Error("Maná acumulado fuera de rango.");
     if(!Number.isFinite(damages[side])||!Number.isFinite(healing[side]))
       throw new Error("Acumulación de daño fuera de rango.");
   }
   for(const charge of effect.combatChargeSpends??[]){
     if(!charge||!validSide(charge.owner)||
       typeof charge.accumulator!=="string"||
       !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(charge.accumulator)||
       !Number.isSafeInteger(charge.amount)||charge.amount<1||charge.amount>6)
       throw new Error("El consumo de cargas temporales no está autorizado.");
     combatChargeSpends.push(charge);
   }
   for(const use of effect.consumableUses??[]){
     if(!validSide(use.owner)||!Number.isSafeInteger(use.itemId)||use.itemId<1||
       use.characterItemId!==undefined&&
         (!Number.isSafeInteger(use.characterItemId)||use.characterItemId<1))
       throw new Error("Identificador de consumible temporal inválido.");
     if(use.owner==="PLAYER"&&use.characterItemId===undefined)
       throw new Error("El jugador necesita una copia real de consumible.");
     if(consumableUses.some(x=>x.owner===use.owner&&x.itemId===use.itemId&&
       x.characterItemId===use.characterItemId))
       throw new Error("Un consumible se usó dos veces en el mismo lote.");
     consumableUses.push(use);
   }
   for(const use of effect.summonsConsumed??[]){
     if(!use||typeof use.id!=="string"||!use.id||use.id.length>160||
       !validSide(use.owner)||
       summonsConsumed.some(x=>x.id===use.id))
       throw new Error("Una criatura fue consumida dos veces por fusión temporal.");
     const previous=snapshot.summons?.find(x=>x.id===use.id&&x.owner===use.owner);
     if(!previous||previous.integrity<=0)
       throw new Error("La fusión intenta retirar una criatura inexistente o ajena.");
     summonsConsumed.push(use);
   }
   for(const summon of effect.summonsCreated??[]){
     if(!summon||!validSide(summon.owner)||
       !Number.isSafeInteger(summon.sourceSkillId)||summon.sourceSkillId<1||
       typeof summon.id!=="string"||summon.id.length>160||
       typeof summon.entityKey!=="string"||!summon.entityKey||
       !validPosition(summon.fieldPosition)||
       !Number.isFinite(summon.integrity)||summon.integrity<=0||
       !Number.isSafeInteger(summon.expiresAtRound)||
       summon.expiresAtRound<=timelineRoundOf(batch.atTick)||
       typeof summon.autoNextTick!=="number"||
       !Number.isSafeInteger(summon.autoNextTick)||
       summon.autoNextTick<=batch.atTick||
       summon.chargesMigrated!==true||
       (summon.chaosField!==undefined&&(
         typeof summon.chaosField!=="object"||
         summon.chaosField.radiusMeters<0.5||
         summon.chaosField.radiusMeters>15||
         !Number.isFinite(summon.chaosField.radiusMeters)||
         ![90,180,270].includes(summon.chaosField.rotationDegrees)||
         typeof summon.chaosField.rotateEachRound!=="boolean"
       ))||
       summonsCreated.some(previous=>previous.id===summon.id||
         previous.owner===summon.owner&&previous.entityKey===summon.entityKey))
       throw new Error("Invocación temporal inválida o duplicada.");
     summonsCreated.push(structuredClone(summon));
   }
   for(const update of effect.summonUpdates??[]){
     if(!update||!validSide(update.owner)||
       typeof update.id!=="string"||update.id.length>160||
       update.fieldPosition!==undefined&&!validPosition(update.fieldPosition)||
       update.behaviorMode!==undefined&&
         !["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"].includes(update.behaviorMode)||
       update.targetId!==undefined&&
         (typeof update.targetId!=="string"||update.targetId.length>160)||
       update.autoNextTick!==undefined&&
         (!Number.isSafeInteger(update.autoNextTick)||
           update.autoNextTick<=batch.atTick)||
       update.autoRound!==undefined&&
         (!Number.isSafeInteger(update.autoRound)||update.autoRound<1)||
       update.autoSpentAp!==undefined&&
         (!Number.isSafeInteger(update.autoSpentAp)||update.autoSpentAp<0))
       throw new Error("Cambio de criatura temporal inválido.");
     // A manual CHANGE_BEHAVIOR / CHANGE_TARGET and the creature's own
     // initiative may end at the SAME tick. They edit different fields and
     // must both succeed; only overlapping contradictory writes are unsafe.
     const previous=summonUpdates.find(other=>other.id===update.id);
     if(previous){
       if(previous.owner!==update.owner)
         throw new Error("Dos dueños intentaron actualizar la misma criatura.");
       for(const field of ["fieldPosition","behaviorMode","targetId",
         "autoNextTick","autoRound","autoSpentAp"] as const){
         const actual=update[field];
         if(actual===undefined)continue;
         const prior=previous[field];
         if(prior!==undefined&&JSON.stringify(prior)!==JSON.stringify(actual))
           throw new Error("Dos acciones alteraron el mismo estado de criatura.");
         // Narrowing via Object.assign avoids widening the discriminated
         // union of independent field values in a dynamic assignment.
         Object.assign(previous,{[field]:actual});
       }
     }else summonUpdates.push(structuredClone(update));
   }
   for(const impact of effect.summonImpacts??[]){
     if(!impact||typeof impact.id!=="string"||impact.id.length>160||
       !validSide(impact.owner)||
       !Number.isFinite(impact.damage)||impact.damage<0||impact.damage>1_000_000||
       !Number.isSafeInteger(impact.hitCountDelta)||
       impact.hitCountDelta<1||impact.hitCountDelta>10)
       throw new Error("Daño temporal de criatura inválido.");
     const previous=summonImpacts.get(impact.id);
     if(previous&&previous.owner!==impact.owner)
       throw new Error("El daño apunta a una criatura de otro dueño.");
     summonImpacts.set(impact.id,{
       id:impact.id,owner:impact.owner,
       damage:(previous?.damage??0)+impact.damage,
       hitCountDelta:(previous?.hitCountDelta??0)+impact.hitCountDelta,
     });
   }
   for(const inversion of effect.summonInversions??[]){
     if(!inversion||!validSide(inversion.owner)||
       !validSide(inversion.target)||
       typeof inversion.id!=="string"||!inversion.id||
       inversion.id.length>160||
       typeof inversion.sourceSummonId!=="string"||
       inversion.sourceSummonId.length>160||
       inversion.chargeAccumulator!==undefined&&
         !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(inversion.chargeAccumulator)||
       summonInversions.some(x=>x.id===inversion.id))
       throw new Error("Inversión simultánea de un estado repetido o inválido.");
     const old=snapshot.summonStatuses?.find(s=>
       s.id===inversion.id&&s.target===inversion.target);
     const source=snapshot.summons?.find(s=>
       s.id===inversion.sourceSummonId&&s.owner===inversion.owner);
     const target=inversion.owner===inversion.target?"USER":"OPPONENT";
     if(!old||!isDebuffStatus(old)||!source||source.integrity<=0||
       !source.contactEffects?.some(e=>e.kind==="INVERT_STATUS"&&
         e.target===target&&
         e.chargeAccumulator===inversion.chargeAccumulator))
       throw new Error("El familiar no autorizó invertir este debilitamiento.");
     summonInversions.push(inversion);
   }
   for(const status of effect.summonContactStatuses??[]){
     if(!status||!validSide(status.by)||!validSide(status.target)||
       typeof status.sourceSummonId!=="string"||
       typeof status.id!=="string"||status.id.length>160||
       !status.id.startsWith("V2_SUMMON:")||
       !["strength","agility","speedValue","constitution",
         "precision","dodge","physicalAttack","physicalDefense",
         "magicAttack","magicDefense","critical","luck","race"].includes(status.stat)||
       !["BONUS","MULTIPLIER"].includes(status.operation)||
       !Number.isFinite(status.value)||
       status.operation==="BONUS"&&Math.abs(status.value)>100000||
       status.operation==="MULTIPLIER"&&(status.value<0||status.value>3)||
       !validDuration(status.durationTurns)||
       summonContactStatuses.some(previous=>previous.id===status.id))
       throw new Error("Contacto modular de criatura inválido.");
     summonContactStatuses.push(status);
   }
   for(const buff of effect.statBonuses??[]){
     if(!validSide(buff.owner)||!Number.isSafeInteger(buff.skillId)||buff.skillId<1||
       !buffStats.has(buff.stat)||typeof buff.skillName!=="string"||
       buff.skillName.length>120||!Number.isFinite(buff.value)||buff.value<=0||
       buff.value>100||!validDuration(buff.durationTurns))
       throw new Error("Bono modular temporal inválido.");
     statBonuses.push(buff);
   }
   for(const status of effect.selfStatuses??[]){
     const charged=status.id.startsWith("V2_CHARGE:");
     const validChargedStat=[
       "strength","agility","speedValue","constitution",
       "precision","dodge","physicalAttack","physicalDefense",
       "magicAttack","magicDefense","critical","luck","race",
     ].includes(status.stat);
     if(!validSide(status.owner)||!Number.isSafeInteger(status.skillId)||
       status.skillId<1||status.id.length>160||
       !validDuration(status.durationTurns)||
       !Number.isFinite(status.value)||
       (charged
         ?(!validChargedStat||status.operation!=="MULTIPLIER"||
           status.value<=1||status.value>3)
         :(!buffStats.has(status.stat)||
           !status.id.startsWith("V2_SUPPORT:")||
           status.operation==="BONUS"&&(status.value<=0||status.value>100)||
           status.operation==="MULTIPLIER"&&(status.value<=1||status.value>1.3)||
           !["BONUS","MULTIPLIER"].includes(status.operation))))
       throw new Error("Estado de soporte o cargas modular inválido.");
     if(selfStatuses.some(existing=>existing.id===status.id))
       throw new Error("Estado de soporte duplicado.");
     selfStatuses.push(status);
   }
   for(const hostile of effect.hostileStatuses??[]){
     if(!validSide(hostile.owner)||!validSide(hostile.target)||
       hostile.owner===hostile.target||
       !Number.isSafeInteger(hostile.skillId)||hostile.skillId<1||
       !hostile.id.startsWith("V2_HOSTILE:")||hostile.id.length>160||
       !validDuration(hostile.durationTurns)||
       !["physicalAttack","magicAttack","physicalDefense",
         "magicDefense","precision","dodge"].includes(hostile.stat)||
       !Number.isFinite(hostile.value)||
       hostile.operation==="BONUS"&&(hostile.value< -20||hostile.value> -1)||
       hostile.operation==="MULTIPLIER"&&(hostile.value<0.8||hostile.value>=1)||
       !["BONUS","MULTIPLIER"].includes(hostile.operation)||
       hostileStatuses.some(previous=>previous.id===hostile.id))
       throw new Error("Estado hostil modular temporal inválido.");
     hostileStatuses.push(hostile);
   }
   for(const cooldown of effect.skillCooldowns??[]){
     if(!validSide(cooldown.owner)||!Number.isSafeInteger(cooldown.skillId)||
       cooldown.skillId<1||!Number.isSafeInteger(cooldown.nextAvailableRound)||
       cooldown.nextAvailableRound < -1)
       throw new Error("Enfriamiento temporal inválido.");
     if(skillCooldowns.some(previous=>
       previous.owner===cooldown.owner&&previous.skillId===cooldown.skillId))
       throw new Error("La habilidad fue ejecutada dos veces en el mismo lote.");
     skillCooldowns.push(cooldown);
   }
   for(const structure of effect.constructionsCreated??[]){
     if(!structure||!validSide(structure.owner)||
       !Number.isSafeInteger(structure.sourceSkillId)||structure.sourceSkillId<1||
       typeof structure.id!=="string"||!structure.id||structure.id.length>160||
       typeof structure.label!=="string"||structure.label.length>120||
       !validStroke(structure.center)||
       structure.fieldPosition!==undefined&&!validPosition(structure.fieldPosition)||
       !["FIELD","BLOCK","DECOR","MIRROR"].includes(structure.form)||
       structure.form==="MIRROR"&&(!structure.mirror||structure.material!=="MIRROR")||
       structure.form==="BLOCK"&&structure.tangible!==true||
       structure.form==="DECOR"&&structure.tangible!==false||
       constructionsCreated.some(c=>c.id===structure.id))
       throw new Error("Creación de objeto temporal inválida.");
     constructionsCreated.push(structuredClone(structure));
   }
   for(const change of effect.constructionWear??[]){
     if(!change||typeof change.id!=="string"||!change.id||
       !Number.isSafeInteger(change.amount)||change.amount<0||
       change.amount>1_000_000||
       !Number.isSafeInteger(change.hitCountDelta)||
       change.hitCountDelta<0||change.hitCountDelta>10)
       throw new Error("Desgaste de objeto temporal inválido.");
     const prior=constructionWear.get(change.id);
     const amount=(prior?.amount??0)+change.amount;
     const hitCountDelta=(prior?.hitCountDelta??0)+change.hitCountDelta;
     if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(hitCountDelta))
       throw new Error("Desgaste de objeto acumulado fuera de rango.");
     constructionWear.set(change.id,{id:change.id,amount,hitCountDelta});
   }
   for(const recovery of effect.weaponRecoveries??[]){
     const event=batch.events.find(e=>e.id===effect.eventId);
     if(!recovery||!validSide(recovery.owner)||
       event?.kind!=="MOVE"||event.owner!==recovery.owner||
       !Number.isSafeInteger(recovery.characterItemId)||
       recovery.characterItemId<1||
       !["MAIN_HAND","OFF_HAND"].includes(recovery.slot)||
       recoveries.some(previous=>previous.owner===recovery.owner&&
         (previous.slot===recovery.slot||
           previous.characterItemId===recovery.characterItemId)))
       throw new Error("Recuperación temporal de arma inválida o duplicada.");
     const fighter=original.actors[recovery.owner];
     const key=recovery.slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
     const candidates=(original.droppedWeapons??[]).filter(entry=>
       entry.owner===recovery.owner&&
       (entry.slot??"MAIN_HAND")===recovery.slot&&
       entry.weapon.characterItemId===recovery.characterItemId);
     const move=effect.positionDelta?.[recovery.owner]??{x:0,y:0};
     const from=fieldPosition(fighter);
     const to={x:from.x+move.x,y:from.y+move.y};
     const target=candidates[0]?.fieldPosition??
       {x:candidates[0]?.positionMeters??NaN,y:from.y};
     if(fighter[key]||candidates.length!==1||
       !validPosition(move)||!validPosition(target)||
       !validPosition(to)||Math.hypot(target.x-to.x,target.y-to.y)>=0.2)
       throw new Error("El arma no está disponible en el punto de recuperación.");
     recoveries.push(recovery);
   }
   for(const launch of effect.projectilesLaunched??[]){
     const event=batch.events.find(e=>e.id===effect.eventId);
     if(!launch||event?.kind!=="ATTACK"||
       event.id!==launch.id||event.owner!==launch.owner||
       !validSide(launch.owner)||event.paidAp!==1||
       !Number.isSafeInteger(launch.launchTick)||
       launch.launchTick!==batch.atTick||
       !Number.isSafeInteger(launch.impactTick)||
       launch.impactTick<=batch.atTick||
       launch.impactTick!==batch.atTick+event.projectileFlightTicks!||
       launch.flightTicks!==event.projectileFlightTicks||
       JSON.stringify(launch.origin)!==JSON.stringify(event.projectileOrigin)||
       JSON.stringify(launch.target)!==JSON.stringify(event.projectileTarget)||
       !launch.command||launch.command.kind!=="ATTACK"||
       launch.command.usesMagic===true||
       !launch.shooter||launches.some(p=>p.id===launch.id)||
       (snapshot.timelineProjectiles??[]).some(p=>p.id===launch.id))
       throw new Error("Salida temporal de proyectil inválida o duplicada.");
     const start=structuredClone(snapshot);
     start.actors[launch.owner].fieldPosition={...launch.origin};
     start.actors[launch.owner].positionMeters=launch.origin.x;
     const other=launch.owner==="PLAYER"?"NPC":"PLAYER";
     start.actors[other].fieldPosition={...launch.target};
     start.actors[other].positionMeters=launch.target.x;
     const approved=physicalProjectileFlightTicks(start,launch.owner,
       launch.command);
     const selected=weaponForSource(snapshot.actors[launch.owner],approved.source);
     if(approved.flightTicks!==launch.flightTicks||
       event.durationTicks!==turnTicks(snapshot.actors[launch.owner],
         selected?launch.command.attackType:undefined)||
       JSON.stringify(launch.shooter)!==JSON.stringify(snapshot.actors[launch.owner]))
       throw new Error("El disparo no corresponde a su origen o arma auténtica.");
     if((snapshot.timelineProjectiles??[]).length+launches.length>=50)
       throw new Error("Hay demasiados proyectiles en el aire.");
     launches.push(structuredClone(launch));
   }
   for(const impact of effect.projectilesImpacted??[]){
     const event=batch.events.find(e=>e.id===effect.eventId);
     const projectile=(snapshot.timelineProjectiles??[]).find(p=>p.id===impact?.id);
     if(!impact||event?.kind!=="AUTO_PROJECTILE"||
       event.id!=="WORLD:AUTO_PROJECTILE:"+batch.atTick+":"+
         encodeURIComponent(impact.id)||
       !projectile||projectile.owner!==impact.owner||
       projectile.impactTick!==batch.atTick||
       !Number.isSafeInteger(impact.weaponWear)||impact.weaponWear<0||
       impact.weaponWear>100000||
       impacts.some(x=>x.id===impact.id))
       throw new Error("Impacto temporal de proyectil duplicado o adulterado.");
     impacts.push(impact);
   }
   for(const thrown of effect.weaponThrows??[]){
     const event=batch.events.find(e=>e.id===effect.eventId);
     if(!thrown||event?.kind!=="ATTACK"||event.owner!==thrown.owner||
       !validSide(thrown.owner)||
       !Number.isSafeInteger(thrown.characterItemId)||
       thrown.characterItemId<1||
       !["MAIN_HAND","OFF_HAND"].includes(thrown.slot)||
       !validPosition(thrown.landing)||
       throws.some(previous=>previous.owner===thrown.owner||
         previous.characterItemId===thrown.characterItemId))
       throw new Error("Lanzamiento temporal de arma inválido o repetido.");
     const selected=thrown.slot==="MAIN_HAND"?
       original.actors[thrown.owner].equippedWeapon:
       original.actors[thrown.owner].offhandWeapon;
     const target=fieldPosition(original.actors[
       thrown.owner==="PLAYER"?"NPC":"PLAYER"]);
     if(!selected||selected.characterItemId!==thrown.characterItemId||
       !selected.throwable||!selected.throwRangeMeters||
       (selected.durability??100)<=0||
       (original.droppedWeapons??[]).some(x=>
         x.weapon.characterItemId===thrown.characterItemId&&
         x.owner===thrown.owner)||
       Math.hypot(target.x-thrown.landing.x,target.y-thrown.landing.y)>1e-6)
       throw new Error("El arma o su punto de caída no corresponden al encuentro.");
     throws.push(thrown);
   }
   for(const item of effect.equipmentWear??[]){
     if(!SIDES.includes(item.owner)||!Number.isSafeInteger(item.characterItemId)||
       item.characterItemId<1||!finiteNonnegative(item.amount)||
       !Number.isSafeInteger(item.amount))
       throw new Error("Desgaste de equipamiento inválido.");
     const key=copyKey(item.owner,item.characterItemId);
     const previous=wear.get(key);
     const sum=(previous?.amount??0)+item.amount;
     if(!Number.isSafeInteger(sum))throw new Error("Desgaste acumulado fuera de rango.");
     wear.set(key,{...item,amount:sum});
   }
   for(const side of SIDES){
     const delta=effect.positionDelta?.[side];
     if(delta!==undefined){
       if(!validPosition(delta)||Math.hypot(delta.x,delta.y)>100)
         throw new Error("Desplazamiento temporal inválido.");
       moved[side].x+=delta.x;
       moved[side].y+=delta.y;
       if(!validPosition(moved[side]))
         throw new Error("Desplazamiento acumulado fuera de rango.");
     }
   }
   for(const side of effect.resetPhysicalStrokes??[]){
     if(!SIDES_SET.has(side))throw new Error("Reinicio de trayectoria inválido.");
     clears.add(side);
   }
   for(const stroke of effect.physicalStrokes??[]){
     if(!SIDES_SET.has(stroke.owner)||
       !["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"].includes(stroke.source)||
       !validStroke(stroke.end))
       throw new Error("Trayectoria física final inválida.");
     if(strokes.some(x=>x.owner===stroke.owner&&x.source===stroke.source))
       throw new Error("Dos acciones actualizaron la misma trayectoria.");
     strokes.push(stroke);
   }
   for(const entry of effect.logs??[]){
     if(!entry||!SIDES_SET.has(entry.by)||typeof entry.kind!=="string"||
       entry.kind.length>64||typeof entry.summary!=="string"||
       entry.summary.length>2000)
       throw new Error("Registro temporal inválido.");
     logs.push({...entry,tick:batch.atTick});
   }
 }
 const next=snapshot;
 // All cost checks precede any durable write; healing never refunds a missing
 // mana point needed by a different simultaneous action.
 for(const side of SIDES){
   const account=next.mana?.[side];
   if(manaSpent[side]||manaRestored[side]){
     if(!account||!Number.isFinite(account.current)||!Number.isFinite(account.max)||
       account.current<0||account.max<account.current||
       manaSpent[side]>account.current)
       throw new Error("Maná insuficiente para resolver el lote temporal.");
     account.current=Math.min(account.max,account.current-manaSpent[side]+manaRestored[side]);
   }
 }
 // Each approved skill consumes its owner wallet only when the whole
 // simultaneous event batch is committed. A negative pool rejects the batch;
 // no client-chosen amount reaches this stage.
 for(const charge of combatChargeSpends)
   spendCombatCharges(next,charge.owner,charge.accumulator,charge.amount);
 // Approved constructions share the real terrain. Only a fully measured
 // solid cylinder may obstruct movement, not an illustrative 2D sprite.
 next.constructions??=[];
 for(const structure of constructionsCreated){
   if(next.constructions.length>=120||
     next.constructions.some(other=>other.id===structure.id))
     throw new Error("Construcción duplicada o sin espacio.");
   if(measuredBlock(structure)){
     const center=structure.fieldPosition!;
     const radius=structure.footprintRadiusMeters!;
     if(SIDES.some(side=>
       Math.hypot(fieldPosition(next.actors[side]).x-center.x,
         fieldPosition(next.actors[side]).y-center.y)<radius))
       throw new Error("No puedes crear un bloque sólido dentro de un combatiente.");
     if(next.constructions.some(existing=>measuredBlock(existing)&&
       Math.hypot(existing.fieldPosition!.x-center.x,
         existing.fieldPosition!.y-center.y)<
       (existing.footprintRadiusMeters??0)+radius-1e-8))
       throw new Error("Dos construcciones sólidas se solapan al mismo tick.");
   }
   next.constructions.push(structure);
 }
 for(const change of constructionWear.values()){
   const structure:CombatConstruction|undefined=next.constructions.find(
     (c:CombatConstruction)=>c.id===change.id);
   if(!structure||!structure.tangible||
     !Number.isFinite(structure.durability)||structure.durability!<0)
     throw new Error("El impacto no corresponde a una construcción tangible.");
   structure.durability=Math.max(0,structure.durability!-change.amount);
   structure.hitCount=(structure.hitCount??0)+change.hitCountDelta;
   if(structure.durability===0)
     next.constructions=next.constructions.filter((c:CombatConstruction)=>c.id!==structure.id);
 }
 // Inventory debits occur in the SAME atomic state as healing and mana.
 // If stock disappears while another event is evaluated, reject the whole
 // batch; the API must later debit the corresponding real copy in its DB tx.
 for(const use of consumableUses){
   const matches=(next.consumables?.[use.owner]??[]).filter(item=>
     item.itemId===use.itemId&&item.characterItemId===use.characterItemId);
   if(matches.length!==1||!Number.isSafeInteger(matches[0].quantity)||
     matches[0].quantity<1)
     throw new Error("El consumible temporal no tiene existencias autorizadas.");
   matches[0].quantity-=1;
 }
 next.summons??=[];
 // The fusion recipe and exact retirements must agree; a random skill may
 // never remove an unrelated summon. Existing creature actions resolve first.
 const fused=summonsCreated.filter(s=>s.fusedFrom?.length);
 const required=fused.flatMap(s=>(s.fusedFrom??[]).map(id=>({
   id,owner:s.owner,
 })));
 if(required.length!==summonsConsumed.length||
   required.some(x=>!summonsConsumed.some(y=>y.id===x.id&&y.owner===x.owner))||
   new Set(required.map(x=>x.id)).size!==required.length)
   throw new Error("La fusión no corresponde a las criaturas consumidas.");
 for(const summon of summonsCreated){
   if(next.summons.length>=30||
     next.summons.some(existing=>existing.id===summon.id||
       existing.owner===summon.owner&&existing.entityKey===summon.entityKey))
     throw new Error("Criatura repetida o sin espacio en el encuentro.");
   const origin=fieldPosition(next.actors[summon.owner]);
   if(Math.hypot(origin.x-summon.fieldPosition.x,origin.y-summon.fieldPosition.y)>
       summon.controlRangeMeters+1e-8)
     throw new Error("Invocación fuera del radio de control.");
   next.summons.push(summon);
 }
 for(const update of summonUpdates){
   const creature=next.summons.find(s=>s.id===update.id&&s.owner===update.owner);
   if(!creature)throw new Error("La criatura seleccionada dejó de estar disponible.");
   if(update.fieldPosition){
     const own=fieldPosition(next.actors[update.owner]);
     if(Math.hypot(update.fieldPosition.x-own.x,update.fieldPosition.y-own.y)>
       creature.controlRangeMeters+1e-8)
       throw new Error("La criatura salió de su radio de control.");
     creature.fieldPosition={...update.fieldPosition};
   }
   if(update.behaviorMode!==undefined){
     if(update.behaviorMode!=="FOLLOW"&&
       !creature.behavior.allowedModes.includes(update.behaviorMode))
       throw new Error("Comportamiento de criatura no aprobado.");
     creature.behavior.mode=update.behaviorMode;
   }
   if(update.targetId!==undefined){
     const targetId=update.targetId;
     if(creature.behavior.target!=="OPPONENT"||
       targetId!=="FIGHTER:"+(update.owner==="PLAYER"?"NPC":"PLAYER")&&
       !next.summons.some(target=>targetId.startsWith("SUMMON:")&&
         target.id===targetId.slice(7)&&
         target.owner!==update.owner&&target.integrity>0))
       throw new Error("Objetivo de invocación ajeno o inválido.");
     creature.targetId=targetId;
   }
   if(update.autoNextTick!==undefined)creature.autoNextTick=update.autoNextTick;
   if(update.autoRound!==undefined)creature.autoRound=update.autoRound;
   if(update.autoSpentAp!==undefined)creature.autoSpentAp=update.autoSpentAp;
 }
 // Both creatures hitting the same familiar at one tick consume its
 // integrity together. The target can act at that very tick before dying.
 for(const impact of summonImpacts.values()){
   const creature:CombatSummon|undefined=next.summons.find(
     (s:CombatSummon)=>s.id===impact.id&&s.owner===impact.owner);
   if(!creature)throw new Error("No existe la criatura afectada por el impacto.");
   creature.integrity=Math.max(0,creature.integrity-impact.damage);
   creature.hitCount+=impact.hitCountDelta;
   if(creature.integrity<=0||creature.hitCount>=creature.hitLimit)
     next.summons=next.summons.filter((s:CombatSummon)=>s.id!==creature.id);
 }
 // Resolve a source's same-tick action/hit first, then retire its
 // official ID even if an opposing impact also destroyed it at this tick.
 // Those simultaneous effects are both legal against the same snapshot.
 if(summonsConsumed.length){
   const consumedIds=new Set(summonsConsumed.map(s=>s.id));
   next.summons=next.summons.filter(s=>!consumedIds.has(s.id));
 }
 // Damage is not canceled by a heal or by a simultaneous lethal attack.
 for(const side of SIDES){
   const actor=next.actors[side];
   const base=original.actors[side].hp;
   actor.hp=Math.min(actor.maxHp,Math.max(0,base-damages[side]+healing[side]));
 }
 // Both concurrent strikes use the SAME previous armor durability. Wear
 // is accumulated before a single exact replay of the surviving equipment.
 applyTimelineEquipmentWear(next,[...wear.values()]);
 next.timelineProjectiles??=[];
 for(const launch of launches){
   if(launch.command.throwWeapon===true){
     const slot=launch.command.attackSource;
     if(slot!=="MAIN_HAND"&&slot!=="OFF_HAND")
       throw new Error("El lanzamiento perdió su ranura oficial.");
     const key=slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
     const item=next.actors[launch.owner][key];
     const saved=launch.shooter[key];
     if(!item||!saved||item.characterItemId!==saved.characterItemId)
       throw new Error("El arma arrojada cambió antes de salir.");
     launch.shooter[key]={...item};
     next.actors[launch.owner][key]=undefined;
   }
   next.timelineProjectiles.push(launch);
 }
 for(const impact of impacts){
   const index=next.timelineProjectiles.findIndex(p=>p.id===impact.id);
   if(index<0)throw new Error("El proyectil ya fue resuelto.");
   const [projectile]=next.timelineProjectiles.splice(index,1);
   if(projectile.command.throwWeapon===true){
     const slot=projectile.command.attackSource;
     if(slot!=="MAIN_HAND"&&slot!=="OFF_HAND")
       throw new Error("El arma arrojada perdió su ranura.");
     const copy=projectile.shooter[slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon"];
     if(!copy||!Number.isSafeInteger(copy.characterItemId)||
       next.droppedWeapons?.some(x=>x.owner===impact.owner&&
         x.weapon.characterItemId===copy.characterItemId))
       throw new Error("La copia arrojada ya existe en el suelo.");
     const durability=Math.max(0,(copy.durability??100)-impact.weaponWear);
     next.droppedWeapons??=[];
     next.droppedWeapons.push({owner:impact.owner,slot,
       weapon:{...copy,durability},
       fieldPosition:{...projectile.target},positionMeters:projectile.target.x});
   }else if(impact.weaponWear!==0)
     throw new Error("Un disparo normal no puede dejar arma en el suelo.");
 }
 for(const thrown of throws){
   const actor=next.actors[thrown.owner];
   const key=thrown.slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
   const item=actor[key];
   if(!item||item.characterItemId!==thrown.characterItemId)
     throw new Error("La copia arrojada cambió antes de confirmar el impacto.");
   next.droppedWeapons??=[];
   next.droppedWeapons.push({owner:thrown.owner,slot:thrown.slot,
     weapon:structuredClone(item),positionMeters:thrown.landing.x,
     fieldPosition:{...thrown.landing}});
   actor[key]=undefined;
 }
 for(const recovery of recoveries){
   const key=recovery.slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
   const index=(next.droppedWeapons??[]).findIndex(entry=>
     entry.owner===recovery.owner&&
     (entry.slot??"MAIN_HAND")===recovery.slot&&
     entry.weapon.characterItemId===recovery.characterItemId);
   if(index<0||next.actors[recovery.owner][key])
     throw new Error("El arma recuperada dejó de estar disponible.");
   const [entry]=next.droppedWeapons!.splice(index,1);
   next.actors[recovery.owner][key]={...entry.weapon};
   if(key==="equippedWeapon")
     next.actors[recovery.owner].weaponIntegrity=entry.weapon.durability??100;
 }
 for(const side of SIDES){
   const delta=moved[side],fighter=next.actors[side];
   if(delta.x!==0||delta.y!==0){
     const current=fieldPosition(original.actors[side]);
     const to={x:current.x+delta.x,y:current.y+delta.y};
     if(!validPosition(to))throw new Error("Posición resultante inválida.");
     fighter.fieldPosition=to;
     fighter.positionMeters=to.x;
     // Forced displacement always breaks a stroke.
     clears.add(side);
   }
   if(clears.has(side)){
     if(next.physicalPathEnd)delete next.physicalPathEnd[side];
     if(next.physicalPathEnds)delete next.physicalPathEnds[side];
   }
 }
 for(const stroke of strokes){
   if(clears.has(stroke.owner))continue;
   next.physicalPathEnd??={};
   next.physicalPathEnd[stroke.owner]={...stroke.end};
   next.physicalPathEnds??={};
   next.physicalPathEnds[stroke.owner]??={};
   next.physicalPathEnds[stroke.owner]![stroke.source]={...stroke.end};
 }
 // Round boundaries, summon upkeep and item self-repair were already
 // applied BEFORE all simultaneous strikes in prepareTimelineImpactSnapshot.
 const priorLog=next.narrativeHistory??next.log.slice();
 next.narrativeHistory=[...priorLog];
 for(const entry of logs){
   next.narrativeHistory.push(entry);
   next.log.push(entry);
 }
 next.log=next.log.slice(-100);
 next.tick=batch.atTick;
 next.round=timelineRoundOf(batch.atTick);
 if((next.skillBonuses?.length??0)+statBonuses.length>100||
   (next.summonStatuses?.length??0)+selfStatuses.length+hostileStatuses.length+
     summonContactStatuses.length>100)
   throw new Error("Demasiados bonos o estados temporales en combate.");
 for(const buff of statBonuses){
   const fighter=next.actors[buff.owner];
   fighter[buff.stat]+=buff.value;
   next.skillBonuses??=[];
   next.skillBonuses.push({
     by:buff.owner,stat:buff.stat,value:buff.value,
     skillId:buff.skillId,skillName:buff.skillName,
     expiresAtRound:next.round+buff.durationTurns,
   });
 }
 // Inversions operate on statuses that already existed at the common
 // snapshot. Fresh simultaneous contacts are applied afterward and cannot
 // be retroactively consumed by an earlier creature action.
 for(const inversion of summonInversions){
   const updated=invertSummonStatus(next,inversion.target,inversion.id);
   if(!updated)throw new Error("El debilitamiento ya no se puede invertir.");
   if(inversion.chargeAccumulator)
     creditCombatCharge(next,inversion.owner,inversion.chargeAccumulator);
 }
 for(const status of selfStatuses){
   applySummonStatus(next,{
     id:status.id,sourceSummonId:"SKILL:"+status.skillId,
     by:status.owner,target:status.owner,stat:status.stat,
     operation:status.operation,value:status.value,
     durationTurns:status.durationTurns,
   });
 }
 for(const status of hostileStatuses){
   applySummonStatus(next,{
     id:status.id,sourceSummonId:"SKILL:"+status.skillId,
     by:status.owner,target:status.target,stat:status.stat,
     operation:status.operation,value:status.value,
     durationTurns:status.durationTurns,
   });
 }
 for(const status of summonContactStatuses){
   applySummonStatus(next,{
     id:status.id,sourceSummonId:status.sourceSummonId,
     by:status.by,target:status.target,stat:status.stat,
     operation:status.operation,value:status.value,
     durationTurns:status.durationTurns,
   });
 }
 for(const skill of skillCooldowns){
   next.skillCooldowns??={};
   next.skillCooldowns[skill.owner]??={};
   const previous=next.skillCooldowns[skill.owner]![String(skill.skillId)]??0;
   if(previous===-1||previous>next.round)
     throw new Error("La habilidad aún se encuentra en enfriamiento.");
   next.skillCooldowns[skill.owner]![String(skill.skillId)]=skill.nextAvailableRound;
 }
 // A double KO is a draw. Never cancel the second simultaneous strike merely
 // because the first fighter reached zero HP while computing the batch.
 if((next.actors.PLAYER.hp<=0||next.actors.NPC.hp<=0)&&
   (next.timelineProjectiles?.length??0)===0){
   next.status="FINISHED";
   next.winner=next.actors.PLAYER.hp>0?"PLAYER":next.actors.NPC.hp>0?"NPC":null;
   const summary=next.winner
     ?next.actors[next.winner].name+" gana el combate"
     :"Ambos combatientes cayeron simultáneamente: empate";
   const end:CombatLog={kind:"END",tick:batch.atTick,by:next.winner??"PLAYER",
     against:next.winner?(next.winner==="PLAYER"?"NPC":"PLAYER"):"NPC",summary};
   next.narrativeHistory.push(end);
   next.log.push(end);
   next.log=next.log.slice(-100);
   next.narrativeText=narrateCombat(next.narrativeHistory,next.actors);
   next.narrativeVersion=COMBAT_NARRATIVE_VERSION;
 }
 return next;
}

export type TimelineAuthorizedResolver=(
 snapshot:Readonly<CombatState>,event:Readonly<TimelineEvent>,
 batch:Readonly<TimelineBatch>,
)=>AuthorizedTimelineEffect|Promise<AuthorizedTimelineEffect>;

/** Evaluate independent effects against one immutable pre-impact snapshot.
 * The caller must persist the resulting combat state AND batch.state in one
 * locked transaction; never save just one of the two.
 */
export async function resolveAuthorizedTimelineBatch(
 original:CombatState,batch:TimelineBatch,
 resolve:TimelineAuthorizedResolver,
):Promise<CombatState> {
 const preImpact=prepareTimelineImpactSnapshot(original,batch);
 const effects=await Promise.all(batch.events.map(event=>resolve(
   structuredClone(preImpact),structuredClone(event),batch)));
 return commitAuthorizedTimelineBatch(original,batch,effects);
}
