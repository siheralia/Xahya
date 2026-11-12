/**
 * Basic magic under the continuous V2 clock.
 *
 * Reuses the existing combat engine's magical attack, hit, armor and
 * resistance calculations in a disposable shadow. It applies the resulting
 * HP, mana, wear and world displacement ONLY through an authorized V2 batch,
 * never when the player submits the attack intention.
 *
 * No spells, mirror rays, summons, persistent areas, hostile status riders,
 * hybrid techniques or external item mutations are silently approximated.
 */
import {
  applyCombatCommand,turnTicks,
  type CombatCommand,type CombatState,type Side,
} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {diffConstructionWorld} from "./timeline-construction-world.ts";
import {assertEquipmentOnlyShadowStats} from "./timeline-equipment-replay.ts";
import {
  isolatePhysicalShadow,weaponCopies,
} from "./timeline-basic-strike.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import type {ContinuousCombatTimeline,TimelineEvent} from "./action-timeline.ts";

type BasicMagic=Extract<CombatCommand,{kind:"ATTACK"}>;
type Dice={hit:number;critical:number;defense:number};
const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const validDice=(roll:Dice)=>roll!=null&&
  [roll.hit,roll.critical,roll.defense].every(n=>
    typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1);
const stats=[
 "strength","agility","constitution","precision","dodge",
 "physicalAttack","physicalDefense","magicAttack","magicDefense",
 "critical","luck","race","maxHp","speedValue",
] as const;

export function simulateBasicMagicTimelineHit(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 attack:BasicMagic,attackDice:Dice,defenseDice:Dice,
 preparedDefense:Extract<CombatCommand,{kind:"DEFEND"}>={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||
   clock.version!==2||event.status!=="RESOLVED"||event.kind!=="ATTACK"||
   event.endsAtTick!==clock.nowTick||!validDice(attackDice)||!validDice(defenseDice))
   throw new Error("La magia todavía no puede ejecutarse en este tick.");
 if(attack.kind!=="ATTACK"||attack.usesMagic!==true||
   attack.rangedPhysical||attack.throwWeapon||
   attack.targetSummonId||attack.targetConstructionId||
   attack.areaAngleDegrees!==undefined||attack.projectileHeights!==undefined)
   throw new Error("El ataque necesita el resolutor de magia avanzada.");
 if( 
   (combat.summonStatuses??[]).some(s=>
     !(s.id.startsWith("V2_SUPPORT:")&&s.by===s.target)&&
     !(s.id.startsWith("V2_HOSTILE:")&&s.by!==s.target)&&
     !s.id.startsWith("V2_SUMMON:"))||
   Object.values(combat.microEffects?.definitions??{}).some(list=>list?.length))
   throw new Error("Existen efectos que requieren el resolutor temporal avanzado.");
 const owner=event.owner,target=other(owner);
 const composite=attack.planarMove!==undefined;
 if(!composite&&attack.movementOrder!==undefined||
   event.durationTicks!==turnTicks(combat.actors[owner])||
   event.paidAp!==(composite?2:1))
   throw new Error("La reserva temporal de magia no coincide con sus ticks y PA.");
 const sourceMana=combat.mana?.[owner];
 if(!sourceMana||!Number.isSafeInteger(sourceMana.current)||sourceMana.current<1)
   throw new Error("Necesitas al menos un punto de maná para lanzar magia.");
 const pre={
   PLAYER:weaponCopies(combat,"PLAYER"),NPC:weaponCopies(combat,"NPC"),
 };
 const shadow=isolatePhysicalShadow(combat,owner);
 const launched=applyCombatCommand(shadow,owner,attack,attackDice);
 if(!launched.pending||launched.pending.against!==target||
   launched.pending.usesMagic!==true)
   throw new Error("La magia básica no produjo un ataque dirigido válido.");
 const actualSpent=sourceMana.current-(launched.mana?.[owner]?.current??NaN);
 if(actualSpent!==1)
   throw new Error("El lanzamiento básico no debitó exactamente un maná.");
 // A physical shield is not a free magic-field reaction. Both defenders
 // retain their own action while the attack is being scheduled.
 const resolved=applyCombatCommand(launched,target,preparedDefense,defenseDice);
 if(resolved.pending||resolved.status!=="ACTIVE"&&resolved.status!=="FINISHED")
   throw new Error("La magia no se pudo resolver.");
 const hpDamage:Partial<Record<Side,number>>={};
 const equipmentWear:NonNullable<AuthorizedTimelineEffect["equipmentWear"]>=[];
 const positionDelta:NonNullable<AuthorizedTimelineEffect["positionDelta"]>={};
 for(const side of ["PLAYER","NPC"] as const){
   const damage=combat.actors[side].hp-resolved.actors[side].hp;
   if(!Number.isFinite(damage)||damage<0)
     throw new Error("La magia generó un cambio de vida que no se puede aplicar.");
   if(damage>0)hpDamage[side]=damage;
   const before=fieldPosition(combat.actors[side]);
   const after=fieldPosition(resolved.actors[side]);
   if(before.x!==after.x||before.y!==after.y)
     positionDelta[side]={x:after.x-before.x,y:after.y-before.y};
   const finalCopies=weaponCopies(resolved,side);
   for(const [characterItemId,oldDurability] of pre[side]){
     const current=finalCopies.get(characterItemId);
     if(current===undefined||current>oldDurability)
       throw new Error("El hechizo alteró el inventario de manera no autorizada.");
     if(current<oldDurability)equipmentWear.push({
       owner:side,characterItemId,amount:oldDurability-current,
     });
   }
   // Armor replay is verified after all equipped-copy wear is gathered.
 }
 assertEquipmentOnlyShadowStats(combat,resolved,equipmentWear);
 // A prepared magic field reserves one mana for its entire time interval.
 // V1 shadows charge once per strike; do NOT copy that per-hit charge.
 const defenderManaDelta=(combat.mana?.[target]?.current??NaN)-
   (resolved.mana?.[target]?.current??NaN);
 if(defenderManaDelta!==(preparedDefense.defense==="MAGIC_FIELD"?1:0))
   throw new Error("El hechizo alteró recursos del objetivo sin autorización.");
 const logs=resolved.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END")
   .map(entry=>({...entry,tick:event.endsAtTick,
     summary:entry.summary.replace(/; esperando reacción$/,"")}));
 const structures=diffConstructionWorld(combat.constructions,resolved.constructions);
 if(structures.created.length)
   throw new Error("La magia creó un objeto sin autorización de invocación.");
 return {eventId:event.id,hpDamage,equipmentWear,positionDelta,
   constructionWear:structures.wear,manaSpent:{[owner]:actualSpent},logs};
}
