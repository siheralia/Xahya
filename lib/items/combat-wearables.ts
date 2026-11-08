/**
 * Encounter-local equipped armor / accessory snapshots. Input comes ONLY from
 * server-owned characterItem rows and staff-managed item definitions.
 * The slot belongs to the copy, not to a player command.
 */
import {compileEquippedItemAutoRepair,type AutoRepairItemEffect} from "./auto-repair.ts";
import {compileEquippedWear,type EquipmentWearRule,type WearableItemType,
  type WearableSlot,wearableSlotAllowed} from "./equipped-wear.ts";

export type CombatWearable={
  characterItemId:number;itemId:number;name:string;
  itemType:WearableItemType;slot:WearableSlot;durability:number;
  wearOnHit?:EquipmentWearRule;autoRepair?:AutoRepairItemEffect;
  /** Staff-assigned material, used when an OFF_HAND armor shield blocks. */
  materialPhysicalResistance?:number;materialName?:string;
  lastAutoRepairRound?:number;autoRepairDisabled?:boolean;
};
type RawRow=Record<string,unknown>;
const id=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
/** A staff-authorized armor copy on OFF_HAND is a shield, never a melee weapon.
 * Return even broken copies so BLOCK can reject them instead of silently
 * granting an unarmed full-integrity guard. */
export function offhandArmorShield(equipment?:readonly CombatWearable[]):CombatWearable|undefined {
 return equipment?.find(item=>item.itemType==="ARMOR"&&item.slot==="OFF_HAND");
}
export function snapshotEquippedWearables(
 catalog:readonly RawRow[],owned:readonly RawRow[],materials:readonly RawRow[]=[]
):CombatWearable[]{
 const byMaterial=new Map<number,RawRow>();
 for(const material of materials){if(id(material.id))byMaterial.set(material.id as number,material);}
 const definitions=new Map<number,RawRow>();
 for(const item of catalog){if(id(item.id))definitions.set(item.id as number,item);}
 const usedSlots=new Set<string>(),usedCopies=new Set<number>();
 const result:CombatWearable[]=[];
 for(const copy of owned){
  if(copy.equipped!==true||!id(copy.id)||!id(copy.itemId)||
    copy.quantity!==1||typeof copy.equippedSlot!=="string"||
    usedSlots.has(copy.equippedSlot)||usedCopies.has(copy.id as number))continue;
  const definition=definitions.get(copy.itemId as number);
  const itemType=definition?.itemType;
  if(itemType!=="ARMOR"&&itemType!=="ACCESSORY")continue;
  const allowedSlots=Array.isArray(definition?.allowedSlots)
    ?(definition.allowedSlots as unknown[]).filter((value):value is string=>typeof value==="string"):undefined;
  if(!wearableSlotAllowed(itemType,copy.equippedSlot,allowedSlots))continue;
  const rawDurability=copy.durability==null?100:Number(copy.durability);
  if(!Number.isFinite(rawDurability))continue;
  const wearable:CombatWearable={
   characterItemId:copy.id as number,itemId:copy.itemId as number,
   name:String(definition?.name??"Equipo").slice(0,120),
   itemType,slot:copy.equippedSlot,
   durability:Math.max(0,Math.min(100,Math.floor(rawDurability))),
  };
  const material=id(definition?.materialId)
    ?byMaterial.get(definition.materialId as number):undefined;
  const resistance=Number(material?.physicalResistance);
  if(material&&Number.isFinite(resistance)&&resistance>=0&&resistance<=1_000_000){
   wearable.materialPhysicalResistance=resistance;
   wearable.materialName=String(material.name??"Material").slice(0,120);
  }
  // Invalid legacy staff recipes must not grant an effect or crash a duel.
  try{const value=compileEquippedWear(definition?.effects,itemType);
   if(value)wearable.wearOnHit=value;}catch{}
  try{const value=compileEquippedItemAutoRepair(definition?.effects,itemType);
   if(value)wearable.autoRepair=value;}catch{}
  usedSlots.add(copy.equippedSlot);usedCopies.add(copy.id as number);
  result.push(wearable);
 }
 return result;
}
