import { db } from "@/lib/db";
import { EFFECT_TYPES } from "@/lib/effects/catalog";

export type RacialEffect = {
  type: string; target?: string; element?: string; value?: number;
  description?: string; capability?: string; durationTurns?: number;
  durationMovements?: number; targetKind?: string; activationCondition?: string;
};
export type RacialSkill = {
  id: number; raceId: number; raceName?: string;
  name: string; description: string | null; category: string;
  effect: RacialEffect[]; manaCost: number; maintenanceCost: number; active: boolean;
};
const CATEGORIES = ["OFFENSIVE","PASSIVE","SUPPORT","UTILITY"];

export function validateRacialSkill(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Datos inválidos.";
  const value = input as Record<string,unknown>;
  if (!Number.isSafeInteger(value.raceId) || Number(value.raceId) <= 0) return "Selecciona una raza.";
  if (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 120) return "Nombre inválido (máximo 120 caracteres).";
  if (typeof value.description !== "string" || value.description.length > 5000) return "Descripción inválida.";
  if (!CATEGORIES.includes(String(value.category))) return "Categoría inválida.";
  for (const key of ["manaCost","maintenanceCost"]) {
    const n = value[key];
    if (!Number.isSafeInteger(n) || Number(n) < 0 || Number(n) > 1000000) return "Los costes deben ser enteros no negativos.";
  }
  if (typeof value.active !== "boolean") return "Estado inválido.";
  if (!Array.isArray(value.effect) || value.effect.length > 20) return "La habilidad admite hasta 20 efectos.";
  for (const row of value.effect) {
    if (!row || typeof row !== "object" || !EFFECT_TYPES.includes(row.type)) return "Tipo de efecto inválido.";
    if (row.element !== undefined && (typeof row.element !== "string" || !/^[A-Z0-9_]{1,64}$/.test(row.element))) return "Elemento inválido.";
    if (row.capability !== undefined && row.capability !== "" && (typeof row.capability !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.capability))) return "Efecto para requisitos inválido.";
    if (row.target !== undefined && (typeof row.target !== "string" || row.target.length > 120)) return "Objetivo inválido.";
    if (row.description !== undefined && (typeof row.description !== "string" || row.description.length > 2000)) return "Descripción del efecto inválida.";
    if (row.value !== undefined && (!Number.isFinite(row.value) || row.value < 0 || row.value > 1000000)) return "Potencia inválida.";
    if (row.durationTurns !== undefined && (!Number.isInteger(row.durationTurns) || row.durationTurns < 0 || row.durationTurns > 20)) return "Duración inválida.";
    if (row.durationMovements !== undefined && (!Number.isInteger(row.durationMovements) || row.durationMovements < 1 || row.durationMovements > 100)) return "Duración inválida.";
  }
  return null;
}

const rowCodec = {
  id:"pg/int4@1", raceId:"pg/int4@1", name:"pg/text@1",
  description:"pg/text@1", category:"pg/text@1", effectText:"pg/text@1",
  manaCost:"pg/int4@1", maintenanceCost:"pg/int4@1", activeText:"pg/text@1",
} as const;

export async function readRacialSkills(): Promise<RacialSkill[]> {
  const query = db.raw.sql`
    SELECT id, "raceId", name, description, category, effect::text AS "effectText",
      "manaCost", "maintenanceCost", active::text AS "activeText"
    FROM public."raceSkill" ORDER BY "raceId", name, id
  `.returnsRow(rowCodec).build();
  const rows = await db.runtime().query(query) as Array<{
    id:number;raceId:number;name:string;description:string|null;category:string;
    effectText:string;manaCost:number;maintenanceCost:number;activeText:string;
  }>;
  return rows.map(({effectText,activeText,...row})=>({
    ...row, effect: JSON.parse(effectText) as RacialEffect[], active:activeText==="true"
  }));
}
