/**
 * D3.3 — attribute ONLY HP actually lost to the already-resolved attack
 * components. This is independent of post-cover damage, critical, defense,
 * target selection, or further state changes.
 *
 * Lethal overkill must not wear equipment as if the defender had HP left:
 * if a 60 physical + 40 magical hit lands on 5 HP, apportion 5 HP, not 100.
 * Nearest-proportion rounding ties toward PHYSICAL; both channels remain
 * capped by the damage they really delivered.
 */
export type DamageByChannel=Readonly<{physical:number;magical:number}>;
const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function attributeActualHpDamage(
 appliedHpDamage:number,afterDefense:DamageByChannel
):DamageByChannel {
 if(!valid(appliedHpDamage)||!valid(afterDefense.physical)||!valid(afterDefense.magical))
  throw new Error("La atribución de HP necesita daños enteros no negativos.");
 const total=afterDefense.physical+afterDefense.magical;
 if(!Number.isSafeInteger(total)||appliedHpDamage>total)
  throw new Error("El daño real de HP no puede exceder el daño de los canales.");
 if(total===0)return {physical:0,magical:0};
 if(appliedHpDamage===total)return {...afterDefense};
 // Nearest proportional division, then clamp to what each part dealt.
 // The remainder is always assigned to the other channel, with no lost HP.
 const proposed=Math.round(appliedHpDamage*(afterDefense.physical/total));
 const physical=Math.max(appliedHpDamage-afterDefense.magical,
   Math.min(afterDefense.physical,proposed));
 const magical=appliedHpDamage-physical;
 return {physical,magical};
}
