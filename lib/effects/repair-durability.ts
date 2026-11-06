/** Shared, side-effect-free durability calculation for skills, passive equipment
 * and future transactional repair/forging services. Item ownership, pricing,
 * materials and resource charges are checked by each authorized caller.
 */
export const REPAIR_TARGET_SELECTORS = [
 "OWNER_MAIN_HAND","OWNER_OFF_HAND","SELECTED_ITEM","SOURCE_ITEM",
] as const;
export type RepairTargetSelector=typeof REPAIR_TARGET_SELECTORS[number];
export type RepairableItem={characterItemId:number;durability:number};
export type RepairDurabilityChange={
 characterItemId:number;requested:number;applied:number;before:number;after:number;
};
export function validateRepairableItem(item:RepairableItem):void{
 if(!Number.isSafeInteger(item.characterItemId)||item.characterItemId<1||
    !Number.isSafeInteger(item.durability)||item.durability<0||item.durability>100)
  throw new Error("Ejemplar o durabilidad de inventario inválidos.");
}
/** No negative repairs, no fractions of an integer durability point, no
 * over-repair, and no multiplication of an item stack by its quantity.
 */
export function calculateDurabilityRepair(
 item:RepairableItem,amount:number,
):RepairDurabilityChange {
 validateRepairableItem(item);
 if(!Number.isFinite(amount)||amount<0||amount>1_000_000)
  throw new Error("Cantidad de reparación inválida.");
 const requested=Math.floor(amount);
 const applied=Math.min(requested,100-item.durability);
 return {characterItemId:item.characterItemId,requested,applied,
  before:item.durability,after:item.durability+applied};
}
