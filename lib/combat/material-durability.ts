/** Weapon wear is based on the physical resistance of its assigned material.
 * Steel (100) is the neutral reference, not the maximum resistance.
 * A missing material or an unconfigured (zero) resistance has neutral wear:
 * it must never divide by zero or turn an ordinary weapon indestructible.
 */
export const NEUTRAL_MATERIAL_PHYSICAL_RESISTANCE=100;

/** Real material resistance remains unbounded above steel's reference.
 * Max 1,000,000 matches the material catalog's server/database validation.
 */
export function effectiveMaterialPhysicalResistance(value:unknown):number {
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>1_000_000)
  return NEUTRAL_MATERIAL_PHYSICAL_RESISTANCE;
 return value;
}

/** Formula: ceil(base wear × 100 / material physical resistance).
 * The base is the *already calculated* legacy BLOCK wear from attack power.
 * A nonzero hit always causes at least one wear point, even for rare materials.
 */
export function calculateMaterialBlockWear(baseWear:number,materialResistance?:number|null):number {
 if(!Number.isFinite(baseWear)||baseWear<0)throw new Error("El desgaste base no es válido.");
 if(baseWear===0)return 0;
 const base=Math.ceil(baseWear);
 const resistance=effectiveMaterialPhysicalResistance(materialResistance);
 return Math.max(1,Math.ceil(base*NEUTRAL_MATERIAL_PHYSICAL_RESISTANCE/resistance));
}

/** Contact with REAL solid cover strains the melee weapon, even if the
 * fighter behind that cover takes no HP damage. The base wear depends on the
 * pressure actually absorbed by measured walls (not the nominal attack or
 * the sum of walls encountered after the strike has stopped).
 *
 * This is ONE wear event per strike regardless of how many walls were hit;
 * ordinary misses, unarmed hits, arrows fired from bows, decorative/legacy
 * obstacles and magic must not use this weapon-contact formula.
 */
export function meleeWeaponWearFromCover(
 attackPressure:number,absorbedPressure:number,materialResistance?:number|null,
):number {
 if(!Number.isFinite(attackPressure)||!Number.isFinite(absorbedPressure)||
    attackPressure<0||absorbedPressure<0)
  throw new Error("La presión sobre el arma no es válida.");
 const absorbed=Math.min(attackPressure,absorbedPressure);
 if(absorbed<=0)return 0;
 return calculateMaterialBlockWear(Math.max(1,Math.ceil(absorbed/8)),materialResistance);
}
