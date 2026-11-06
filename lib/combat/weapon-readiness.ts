import type {CombatWeapon} from "./turn-engine.ts";

/** Weapon copies are an equipment snapshot, not a cosmetic attack source.
 * Missing durability on pre-inventory encounters is a legacy "unknown", not
 * implicit breakage. Real zero or invalid durability means unusable until
 * repaired by an explicit future mechanic; it never heals automatically.
 */
export function combatWeaponOperational(weapon:CombatWeapon|undefined):boolean {
 if(!weapon)return false;
 if(weapon.durability===undefined)return true;
 return Number.isFinite(weapon.durability)&&weapon.durability>0;
}

/** A copied physical item retains its instance durability when a stack is
 * split for equipment. The database owns validation/range and inventory IDs;
 * we never replenish a partially worn copy during a slot change.
 */
export function equipmentCopyDurability(
 durability:number|null|undefined,
):number {
 if(durability===null||durability===undefined)return 100;
 if(!Number.isSafeInteger(durability)||durability<0||durability>100)
  throw new Error("Durabilidad de inventario inválida.");
 return durability;
}
