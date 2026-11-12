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
import {diffConstructionWorld} from "./timeline-construction-world.ts";
import {assertEquipmentOnlyShadowStats} from "./timeline-equipment-replay.ts";
import {validateProjectileHeights} from "./physical-obstacles.ts";
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
 const projectile=attack.rangedPhysical===true||attack.throwWeapon===true;
 if(attack.kind!=="ATTACK"||attack.usesMagic||
   attack.targetSummonId||attack.targetConstructionId||
   (!projectile&&attack.areaCenter!==undefined)||
   attack.areaAngleDegrees!==undefined||
   (!projectile&&attack.projectileHeights!==undefined))
   throw new Error("Este tipo de ataque necesita el resolutor temporal avanzado.");
 // The current event patch only supports HP and equipment wear. A future
 // resolver must commit construction damage, summon effects, statuses,
 // buff expiration and micro state in the same transaction.
 if( (combat.summonStatuses??[]).some(status=>
     !(status.id.startsWith("V2_SUPPORT:")&&status.by===status.target)&&
     !(status.id.startsWith("V2_HOSTILE:")&&status.by!==status.target)&&
     !status.id.startsWith("V2_SUMMON:"))||
   Object.values(combat.microEffects?.definitions??{}).some(x=>x?.length))
   throw new Error("El combate contiene efectos que requieren resolución temporal avanzada.");
 const attacker=event.owner,target=other(attacker);
 const source=attack.attackSource??defaultAttackSource(combat.actors[attacker]);
 const selected=weaponForSource(combat.actors[attacker],source);
 const attackTicks=turnTicks(combat.actors[attacker],selected?attack.attackType:undefined);
 const composite=attack.planarMove!==undefined;
 if(projectile){
   const center=attack.areaCenter,heights=attack.projectileHeights;
   if(composite||attack.movementOrder!==undefined||
     source!=="MAIN_HAND"&&source!=="OFF_HAND"||
     !selected||(selected.durability??100)<=0||
     selected.attackType!==attack.attackType||
     (attack.throwWeapon===true
       ?!selected.throwable||!selected.throwRangeMeters||
         !Number.isSafeInteger(selected.characterItemId)
       :selected.mode!=="RANGED"))
     throw new Error("El ataque a distancia perdió su arma o autorización.");
   if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.y)||
     center.x<0||center.x>1||center.y<0||center.y>1||!heights||
     attack.trajectory?.length)
     throw new Error("El disparo necesita puntería y alturas válidas.");
   validateProjectileHeights(heights.launchMeters,heights.impactMeters,
     heights.arcRiseMeters);
   if(!Number.isSafeInteger(event.projectileFlightTicks)||
     event.projectileFlightTicks!<1||
     event.durationTicks!==attackTicks+event.projectileFlightTicks!||
     event.paidAp!==1)
     throw new Error("La reserva del vuelo no corresponde al ataque físico.");
 }else{
   const expected=composite?Math.max(turnTicks(combat.actors[attacker]),attackTicks):attackTicks;
   if(attack.movementOrder!==undefined&&!composite)
     throw new Error("El desplazamiento necesita un vector aprobado.");
   if(event.projectileFlightTicks!==undefined||
     event.durationTicks!==expected||event.paidAp!==(composite?2:1))
     throw new Error("La reserva de ataque no coincide con el coste físico aprobado.");
 }
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
 const previousDrops=combat.droppedWeapons??[];
 const nextDrops=resolved.droppedWeapons??[];
 const addedDrops=nextDrops.filter(item=>!previousDrops.some(before=>
   before.owner===item.owner&&
   before.weapon.characterItemId===item.weapon.characterItemId));
 if(previousDrops.some(item=>!nextDrops.some(after=>
   after.owner===item.owner&&
   after.weapon.characterItemId===item.weapon.characterItemId)))
   throw new Error("El disparo retiró un arma caída no autorizada.");
 const weaponThrows:NonNullable<AuthorizedTimelineEffect["weaponThrows"]>=[];
 if(attack.throwWeapon===true){
   const dropped=addedDrops[0],slot=source;
   const copy=selected?.characterItemId;
   const key=slot==="MAIN_HAND"?"equippedWeapon":"offhandWeapon";
   if(addedDrops.length!==1||!dropped||copy===undefined||
     dropped.owner!==attacker||dropped.weapon.characterItemId!==copy||
     (dropped.slot??"MAIN_HAND")!==slot||
     !dropped.fieldPosition||resolved.actors[attacker][key]!==undefined)
     throw new Error("El lanzamiento creó una copia de arma inesperada.");
   weaponThrows.push({owner:attacker,characterItemId:copy,
     slot,landing:{...dropped.fieldPosition}});
 }else if(addedDrops.length)
   throw new Error("Un disparo que no arroja arma alteró el suelo.");
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
 // Verify exact catalog-derived changes in the V1 shadow, then let the
 // atomic commit replay them ONCE after all concurrent strikes.
 assertEquipmentOnlyShadowStats(combat,resolved,equipmentWear);
 const ending=resolved.physicalPathEnds?.[attacker]?.[source];
 const physicalStrokes:NonNullable<AuthorizedTimelineEffect["physicalStrokes"]>=
   ending?[{owner:attacker,source,end:{...ending}}]:[];
 if(preparedDefense.defense==="COUNTER"){
   for(const [sourceName,endpoint] of Object.entries(
     resolved.physicalPathEnds?.[target]??{})){
     if(!endpoint)continue;
     if(["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"].includes(sourceName))
       physicalStrokes.push({owner:target,
         source:sourceName as typeof source,end:{...endpoint}});
   }
 }
 const logs=resolved.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END")
   .map(entry=>({...entry,tick:event.endsAtTick,
     summary:entry.summary.replace(/; esperando reacción$/,"")}));
 const defenderMana=(combat.mana?.[target]?.current??0)-
   (resolved.mana?.[target]?.current??0);
 if(!Number.isSafeInteger(defenderMana)||defenderMana<0||
   defenderMana>(preparedDefense.defense==="COUNTER"?1:0))
   throw new Error("El contraataque gastó maná no autorizado.");
 const structures=diffConstructionWorld(combat.constructions,resolved.constructions);
 if(structures.created.length)
   throw new Error("El golpe físico generó una construcción inesperada.");
 return {eventId:event.id,hpDamage,equipmentWear,weaponThrows,
   ...(attack.throwWeapon===true?{resetPhysicalStrokes:[attacker]}:{}),
   positionDelta,physicalStrokes,constructionWear:structures.wear,
   ...(defenderMana?{manaSpent:{[target]:defenderMana}}:{}),logs};
}
