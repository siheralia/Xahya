/**
 * V2 equipment threshold reconciliation.
 *
 * V1 damage calculation is used inside isolated shadows. An item can break
 * during that calculation, removing its exact server-captured sheet stats,
 * basic-stat dependencies and max HP/mana. V2 commits ALL simultaneous
 * damage/wear first, then replays the catalog model exactly ONCE over the
 * authoritative snapshot. No inverses, approximate stat multipliers or free
 * restoration of current HP/mana.
 */
import {
 reconcileWearableBonusesAtCombatStart,
 type CombatState,type Side,
} from "./turn-engine.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import type {SummonStatus} from "./summon-status.ts";

export type TimelineEquipmentWear=NonNullable<
 AuthorizedTimelineEffect["equipmentWear"]
>;
export const TIMELINE_EQUIPMENT_STATS=[
 "strength","agility","constitution","precision","dodge",
 "physicalAttack","physicalDefense","magicAttack","magicDefense",
 "critical","luck","race","maxHp","speedValue",
] as const;

export function applyTimelineEquipmentWear(
 state:CombatState,wear:readonly TimelineEquipmentWear[number][],
):void{
 const touched=new Set<Side>();
 for(const entry of wear){
   if(!["PLAYER","NPC"].includes(entry.owner)||
     !Number.isSafeInteger(entry.characterItemId)||
     entry.characterItemId<=0||!Number.isSafeInteger(entry.amount)||
     entry.amount<0)
     throw new Error("Desgaste de copia equipado V2 inválido.");
   const fighter=state.actors[entry.owner];
   const parts=[fighter.equippedWeapon,fighter.offhandWeapon,
     ...(fighter.equippedWearables??[]),
     ...(state.droppedWeapons??[]).filter(x=>x.owner===entry.owner)
       .map(x=>x.weapon)];
   const item=parts.find(x=>x?.characterItemId===entry.characterItemId);
   if(!item)throw new Error("El desgaste apunta a un objeto ajeno al equipamiento.");
   const previous=item.durability??100;
   item.durability=Math.max(0,previous-entry.amount);
   if(item===fighter.equippedWeapon)fighter.weaponIntegrity=item.durability;
   if(fighter.equippedWearables?.some(w=>w===item))
     touched.add(entry.owner);
 }
 for(const side of touched)
   reconcileWearableBonusesAtCombatStart(state,side);
}

/** A combat shadow cannot smuggle arbitrary buffs while simulating the wear.
 * New verified summon/skill status deltas may be supplied separately;
 * otherwise the only permitted attribute change is the exact equipment
 * replay delta. This validates the entire outcome before durable commit.
 */
export function assertEquipmentOnlyShadowStats(
 before:CombatState,after:CombatState,wear:TimelineEquipmentWear,
):void{
 const predicted=structuredClone(before);
 applyTimelineEquipmentWear(predicted,wear);
 for(const side of ["PLAYER","NPC"] as const){
   const previous=before.summonStatuses??[];
   const current=after.summonStatuses??[];
   const old=(stat:string)=>previous.filter(s=>s.target===side&&s.stat===stat)
     .reduce((n,s)=>n+s.appliedDelta,0);
   const next=(stat:string)=>current.filter(s=>s.target===side&&s.stat===stat)
     .reduce((n,s)=>n+s.appliedDelta,0);
   for(const key of TIMELINE_EQUIPMENT_STATS){
     const expected=predicted.actors[side][key]+next(key)-old(key);
     const actual=after.actors[side][key];
     if(!Number.isFinite(actual)||Math.abs(expected-actual)>1e-7)
       throw new Error("El golpe alteró atributos fuera de su equipo y estados autorizados.");
   }
   if(predicted.mana?.[side]?.max!==after.mana?.[side]?.max)
     throw new Error("El golpe modificó la capacidad de maná sin equipo autorizado.");
 }
}
