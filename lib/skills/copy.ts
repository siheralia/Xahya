export const COPY_MODES = ["PERMANENT","TEMPORARY","IMITATION","COLLECTION"] as const;
export type CopyMode = (typeof COPY_MODES)[number];
export type CopyEffect = {
  type: string; value?: number; copyMode?: CopyMode; copyDurationTurns?: number;
  copyCapacity?: number; copyFidelityPercent?: number; copyAllowSpecial?: boolean;
  copyAllowRacial?: boolean;
};
export function validateCopyEffect(effect: CopyEffect): string | null {
  if (effect.type !== "COPY_SKILL") return null;
  if (!COPY_MODES.includes(effect.copyMode ?? "PERMANENT")) return "Modalidad de copia inválida.";
  if (!Number.isSafeInteger(effect.value) || Number(effect.value) < 1 || Number(effect.value) > 1000000) return "La complejidad máxima debe estar entre 1 y 1000000 PCH.";
  if (effect.copyDurationTurns !== undefined && (!Number.isSafeInteger(effect.copyDurationTurns) || Number(effect.copyDurationTurns) < 1 || Number(effect.copyDurationTurns) > 100)) return "Duración de copia inválida.";
  if (effect.copyCapacity !== undefined && (!Number.isSafeInteger(effect.copyCapacity) || Number(effect.copyCapacity) < 1 || Number(effect.copyCapacity) > 100)) return "Capacidad de copia inválida.";
  if (effect.copyFidelityPercent !== undefined && (!Number.isSafeInteger(effect.copyFidelityPercent) || Number(effect.copyFidelityPercent) < 1 || Number(effect.copyFidelityPercent) > 100)) return "Fidelidad de copia inválida.";
  if (effect.copyAllowSpecial !== undefined && typeof effect.copyAllowSpecial !== "boolean") return "Permiso de habilidades especiales inválido.";
  if (effect.copyAllowRacial !== undefined && typeof effect.copyAllowRacial !== "boolean") return "Permiso de habilidades raciales inválido.";
  return null;
}
export function canCopySkill(effect: CopyEffect, original: {pchCost?:number;effect?:unknown;grantedByRacePerkId?:number|null;grantedByRaceSkillId?:number|null}, mode: CopyMode): string | null {
  const error=validateCopyEffect(effect);
  if (error) return error;
  if ((effect.copyMode ?? "PERMANENT") !== mode) return "Esta habilidad no permite esa modalidad de copia.";
  if (Number(original.pchCost ?? 0) > Number(effect.value)) return "La complejidad de la habilidad supera el dominio de copia.";
  if (original.grantedByRaceSkillId || original.grantedByRacePerkId) {
    if (!effect.copyAllowRacial) return "Esta habilidad no permite copiar habilidades raciales.";
  }
  const effects=Array.isArray(original.effect)?original.effect as Array<{type?:string}>:[];
  if (effects.some(e=>e.type === "COPY_SKILL")) return "No se permite copiar otra habilidad de copia.";
  if (effects.some(e=>["MIRROR_RAY","SUMMON_MIRROR","MAGIC_REFLECTION"].includes(String(e.type))) && effect.copyAllowSpecial===false) return "La copia de habilidades especiales está desactivada.";
  return null;
}
export function copySkillSnapshot<T extends {effect:unknown;name:string}>(original:T, effect:CopyEffect) {
  const fidelity=(effect.copyFidelityPercent ?? 100)/100;
  const cloned=structuredClone(original);
  if (Array.isArray(cloned.effect)) cloned.effect=cloned.effect.map((row:{type?:string;value?:number})=>({
    ...row, value:typeof row.value==="number" ? (String(row.type).endsWith("_MULTIPLIER") ? Math.max(1,Number((100+(row.value-100)*fidelity).toFixed(2))) : Math.max(0.01,Number((row.value*fidelity).toFixed(2)))) : row.value
  }));
  return cloned;
}
