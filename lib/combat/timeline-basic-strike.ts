/**
 * First trusted damage adapter for a V2 completed ATTACK event.
 *
 * Reuses Xahya's real physical-contact formulas in an isolated V1 shadow.
 * The shadow's temporary PA/tick bookkeeping is intentionally discarded:
 * those costs were already reserved by the V2 timeline at declaration.
 *
 * This function explicitly rejects advanced mechanics whose side-effects
 * cannot yet be represented as a simultaneous authorized patch. Never call
 * it as a generic resolver for spells, summons, structures or a live API.
 */
import {
  applyCombatCommand,turnTicks,weaponForSource,defaultAttackSource,
  type CombatCommand,type CombatState,type Side,
} from "./turn-engine.ts";
import {offhandArmorShield} from "../items/combat-wearables.ts";
import {fieldPosition} from "./field-plane.ts";
import {activeTimelineBlockAt,
  type ContinuousCombatTimeline,type TimelineEvent} from "./action-timeline.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type BasicStrike=Extract<CombatCommand,{kind:"ATTACK"}>;
type Dice={hit:number;critical:number;defense:number};
const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const validDice=(dice:Dice)=>dice!=null&&
  [dice.hit,dice.critical,dice.defense].every(n=>Number.isFinite(n)&&n>=0&&n<=1);

export function weaponCopies(state:CombatState,side:Side):Map<number,number>{
 const actor=state.actors[side];
 const parts=[actor.equippedWeapon,actor.offhandWeapon,...(actor.equippedWearables??[]),
   ...(state.droppedWeapons??[]).filter(d=>d.owner===side).map(d=>d.weapon)];
 const found=new Map<number,number>();
 for(const part of parts){
   if(!part||!Number.isSafeInteger(part.characterItemId)||!part.characterItemId)continue;
   if(!found.has(part.characterItemId))
     found.set(part.characterItemId,part.durability??100);
 }
 return found;
}

export function activeBlockSlot(
 state:CombatState,clock:ContinuousCombatTimeline,defender:Side,tick:number,
):"MAIN_HAND"|"OFF_HAND"|null{
 const block=activeTimelineBlockAt(clock,defender,tick);
 if(!block?.blockToolSlot)return null;
 const actor=state.actors[defender];
 const item=block.blockToolSlot==="MAIN_HAND"?actor.equippedWeapon:
   actor.offhandWeapon??offhandArmorShield(actor.equippedWearables);
 if(!item || (item.durability??100)<=0)return null;
 if(block.blockToolCopyId!==undefined&&block.blockToolCopyId!==item.characterItemId)
   return null;
 return block.blockToolSlot;
}

export function isolatePhysicalShadow(original:CombatState,attacker:Side):CombatState{
 const shadow=structuredClone(original);
 shadow.round=1;shadow.tick=0;
 shadow.pending=null;shadow.timelineMode=undefined;shadow.tieOpener=attacker;
 shadow.activeBlocks={};shadow.mirrorRayQueue=[];
 shadow.log=[];shadow.narrativeHistory=[];
 for(const side of ["PLAYER","NPC"] as const){
   shadow.actors[side].spentTicks=0;
   shadow.actors[side].spentAp=0;
 }
 return shadow;
}

/** Resolves one already-validated basic physical strike as a pure delta.
 * Two simultaneous hits must each call this function with the SAME snapshot,
 * then pass the effects together to commitAuthorizedTimelineBatch.
 */
export function simulateBasicPhysicalTimelineHit(
 combat:CombatState,clock:ContinuousCombatTimeline,
 event:TimelineEvent,attack:BasicStrike,attackDice:Dice,defenseDice:Dice,
 preparedDefense:Extract<CombatCommand,{kind:"DEFEND"}>={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect {
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.kind!=="ATTACK"||event.status!=="RESOLVED"||
   event.endsAtTick!==clock.nowTick||
   !validDice(attackDice)||!validDice(defenseDice))
   throw new Error("El impacto V2 no está autorizado para resolverse.");
 if(attack.kind!=="ATTACK"||attack.usesMagic||attack.rangedPhysical||
   attack.throwWeapon||attack.planarMove||attack.movementOrder||
   attack.targetSummonId||attack.targetConstructionId||
   attack.areaCenter||attack.areaAngleDegrees!==undefined||
   attack.projectileHeights)
   throw new Error("Este tipo de ataque necesita el resolutor temporal avanzado.");
 // The current event patch only supports HP and equipment wear. A future
 // resolver must commit construction damage, summon effects, statuses,
 // buff expiration and micro state in the same transaction.
 if((combat.constructions?.length??0)>0||(combat.summons?.length??0)>0||
   (combat.summonStatuses??[]).some(status=>!status.id.startsWith("V2_SUPPORT:"))||
   Object.values(combat.microEffects?.definitions??{}).some(x=>x?.length))
   throw new Error("El combate contiene efectos que requieren resolución temporal avanzada.");
 const attacker=event.owner,target=other(attacker);
 const source=attack.attackSource??defaultAttackSource(combat.actors[attacker]);
 const selected=weaponForSource(combat.actors[attacker],source);
 const attackTicks=turnTicks(combat.actors[attacker],selected?attack.attackType:undefined);
 // The approved scheduler, not the browser, defines duration and PA.
 if(event.durationTicks!==attackTicks||event.paidAp!==1)
   throw new Error("La reserva de ataque no coincide con el coste físico aprobado.");
 const before={
   PLAYER:weaponCopies(combat,"PLAYER"),NPC:weaponCopies(combat,"NPC"),
 };
 const slot=activeBlockSlot(combat,clock,target,event.endsAtTick);
 const shadow=isolatePhysicalShadow(combat,attacker);
 const launched=applyCombatCommand(shadow,attacker,attack,attackDice);
 if(!launched.pending||launched.pending.against!==target)
   throw new Error("El golpe no produjo un impacto básico al rival.");
 const resolved=applyCombatCommand(launched,target,
   slot?{kind:"DEFEND",defense:"BLOCK",weaponSlot:slot}:preparedDefense,defenseDice);
 if(resolved.pending)
   throw new Error("El golpe dejó otro ataque sin resolver.");
 const hpDamage:Partial<Record<Side,number>>={};
 for(const side of ["PLAYER","NPC"] as const){
   const damage=combat.actors[side].hp-resolved.actors[side].hp;
   if(damage<0)throw new Error("La simulación física produjo una curación no contabilizada.");
   if(damage>0)hpDamage[side]=damage;
 }
 const equipmentWear:Array<{owner:Side;characterItemId:number;amount:number}>=[];
 for(const side of ["PLAYER","NPC"] as const){
   const after=weaponCopies(resolved,side);
   for(const [characterItemId,oldIntegrity] of before[side]){
     const newer=after.get(characterItemId);
     if(newer===undefined)throw new Error("El golpe eliminó equipamiento sin resolutor autorizado.");
     if(newer>oldIntegrity)throw new Error("El golpe alteró la reparación de equipamiento.");
     if(newer<oldIntegrity)equipmentWear.push({
       owner:side,characterItemId,amount:oldIntegrity-newer,
     });
   }
 }

 // The old resolver can push fighters on contact. Such forced movement is
 // part of the hit and must not disappear when we discard V1's clock.
 const positionDelta:Partial<Record<Side,{x:number;y:number}>>={};
 for(const side of ["PLAYER","NPC"] as const){
   const from=fieldPosition(combat.actors[side]);
   const to=fieldPosition(resolved.actors[side]);
   if(to.x!==from.x||to.y!==from.y)
     positionDelta[side]={x:to.x-from.x,y:to.y-from.y};
 }
 // Breaking a wearable can remove stats from its owner. Until the V2 patch
 // format can replay those derived stat changes, never pretend only the HP
 // and item durability changed.
 const statKeys=["strength","agility","constitution","precision","dodge",
   "physicalAttack","physicalDefense","magicAttack","magicDefense",
   "critical","luck","race","maxHp","speedValue"] as const;
 for(const side of ["PLAYER","NPC"] as const){
   if(statKeys.some(key=>combat.actors[side][key]!==resolved.actors[side][key]))
     throw new Error("La rotura de equipo requiere actualización temporal de estadísticas.");
 }
 const ending=resolved.physicalPathEnds?.[attacker]?.[source];
 const physicalStrokes=ending?[{owner:attacker,source,end:{...ending}}]:[];
 const logs=resolved.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END")
   .map(entry=>({...entry,tick:event.endsAtTick,
     summary:entry.summary.replace(/; esperando reacción$/,"")}));
 return {eventId:event.id,hpDamage,equipmentWear,positionDelta,physicalStrokes,logs};
}
