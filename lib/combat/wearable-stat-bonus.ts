/**
 * Encounter-only equipment stats. Only flat, direct bonuses to existing fighter
 * derived stats may be toggled without rerunning the configurable stat engine.
 * Base-stat modifiers, multiplicative bonuses, resources and formula-derived
 * changes must NOT be approximated here.
 */
import type {CombatFighter} from "./turn-engine.ts";
import type {CombatWearable} from "../items/combat-wearables.ts";

export const WEARABLE_DIRECT_COMBAT_STATS=[
 "physicalAttack","magicAttack","physicalDefense","magicDefense",
 "precision","dodge","critical",
] as const;
export type WearableDirectCombatStat=typeof WEARABLE_DIRECT_COMBAT_STATS[number];
export type WearableStatSnapshot={
 characterItemId:number;itemId:number;
 bonuses:Partial<Record<WearableDirectCombatStat,number>>;
};
const supported=new Set<string>(WEARABLE_DIRECT_COMBAT_STATS);

export function combatWearableStatSnapshots(
 equipped:readonly Record<string,unknown>[],
 catalog:readonly Record<string,unknown>[],
 derivedAliases:Readonly<Record<string,string>>,
 effectMultiplier:Readonly<Record<string,number>>,
):WearableStatSnapshot[]{
 const definitions=new Map<number,Record<string,unknown>>();
 for(const item of catalog){
  const id=Number(item.id);
  if(Number.isSafeInteger(id)&&id>0)definitions.set(id,item);
 }
 const snapshots:WearableStatSnapshot[]=[];
 const ids=new Set<number>();
 for(const copy of equipped){
  const id=Number(copy.id),itemId=Number(copy.itemId);
  if(copy.equipped!==true||Number(copy.quantity)!==1||
     !Number.isSafeInteger(id)||id<1||ids.has(id)||
     !Number.isSafeInteger(itemId)||itemId<1)continue;
  const item=definitions.get(itemId);
  if(item?.itemType!=="ARMOR"&&item?.itemType!=="ACCESSORY")continue;
  ids.add(id);
  const bonuses:Partial<Record<WearableDirectCombatStat,number>>={};
  for(const effect of Array.isArray(item.effects)?item.effects:[]){
   if(!effect||typeof effect!=="object"||Array.isArray(effect))continue;
   const record=effect as Record<string,unknown>;
   if(record.type!=="stat_bonus"||typeof record.stat!=="string")continue;
   // Apply exactly the configured derived aliases, not legacy/deactivated
   // stat keys. An unsupported target must remain completely untouched.
   const key=derivedAliases[record.stat];
   if(!key||!supported.has(key))continue;
   const value=record.value;
   if(typeof value!=="number"||!Number.isFinite(value))continue;
   const scale=effectMultiplier[key]??1;
   if(!Number.isFinite(scale)||scale<0)continue;
   const applied=value*scale;
   if(!Number.isFinite(applied)||Math.abs(applied)>1_000_000)continue;
   const stat=key as WearableDirectCombatStat;
   bonuses[stat]=(bonuses[stat]??0)+applied;
  }
  if(Object.keys(bonuses).length>0)
   snapshots.push({characterItemId:id,itemId,bonuses});
 }
 return snapshots;
}

/**
 * The fighter starts from a snapshot that already included all equipped item
 * effects, including items at 0 durability. Reconcile exactly once at creation,
 * then on crossing the 0/positive durability threshold. Other combat buffs,
 * perks and bonuses remain untouched. Old sessions without statBonuses noop.
 */
export function reconcileWearableStatBonuses(
 fighter:CombatFighter,item:CombatWearable,
):{active:boolean;changes:Partial<Record<WearableDirectCombatStat,number>>}|null{
 const bonuses=item.statBonuses;
 if(!bonuses)return null;
 const next=item.durability>0;
 const previous=item.statBonusActive??true;
 item.statBonusActive=next;
 if(previous===next)return null;
 const changes:Partial<Record<WearableDirectCombatStat,number>>={};
 for(const key of WEARABLE_DIRECT_COMBAT_STATS){
  const value=bonuses[key];
  if(typeof value!=="number"||!Number.isFinite(value)||value===0)continue;
  const delta=next?value:-value;
  fighter[key]=Math.max(0,fighter[key]+delta);
  changes[key]=delta;
 }
 return {active:next,changes};
}
