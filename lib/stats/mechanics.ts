import { db } from "@/lib/db";
import { CORE_BASIC_STAT_KEYS, readStatisticsCatalog } from "@/lib/stats/dynamic";

export const MECHANIC_DEFAULTS = { mazeStealth: "stealth", mazeDetection: "detection", casinoInfluence: "luck" } as const;
export type MechanicKey = keyof typeof MECHANIC_DEFAULTS;
const SETTING_KEY = "statistics.mechanics.v1";

export async function mechanicOptions(source: any = db) {
  const catalog = await readStatisticsCatalog(source);
  const basics = catalog.filter((entry) => entry.kind === "basic" && entry.active !== false);
  const derived = catalog.filter((entry) => entry.kind === "derived" && entry.active !== false);
  const options = [...basics, ...derived].map((entry) => ({ key: entry.key, name: entry.name, kind: entry.kind }));
  for (const key of CORE_BASIC_STAT_KEYS) {
    if (!options.some((entry) => entry.key === key)) options.push({ key, name: key, kind: "basic" });
  }
  for (const key of ["stealth", "detection"]) {
    if (!options.some((entry) => entry.key === key)) options.push({ key, name: key === "stealth" ? "Sigilo" : "Detección", kind: "derived" });
  }
  return options;
}

export async function readMechanics(source: any = db): Promise<Record<MechanicKey, string>> {
  const Setting = (source.orm.public as any).AppSetting;
  const row = Setting ? await Setting.where({ key: SETTING_KEY }).first() : null;
  let parsed: Record<string, unknown> = {};
  try { parsed = row?.value ? JSON.parse(String(row.value)) : {}; } catch { /* defaults */ }
  const options = await mechanicOptions(source);
  const valid = new Set(options.map((option) => option.key));
  return Object.fromEntries(Object.entries(MECHANIC_DEFAULTS).map(([key, fallback]) => [key, typeof parsed[key] === "string" && valid.has(parsed[key]) ? parsed[key] : fallback])) as Record<MechanicKey, string>;
}

export async function writeMechanics(input: Record<MechanicKey, string>, source: any = db) {
  const options = await mechanicOptions(source);
  const valid = new Set(options.map((option) => option.key));
  if (Object.keys(MECHANIC_DEFAULTS).some((key) => !valid.has(input[key as MechanicKey]))) throw new Error("Estadística no válida o inactiva.");
  const Setting = (source.orm.public as any).AppSetting;
  if (!Setting) throw new Error("Configuración no disponible.");
  const row = await Setting.where({ key: SETTING_KEY }).first();
  if (row) await Setting.where({ id: row.id }).update({ value: JSON.stringify(input) });
  else await Setting.create({ key: SETTING_KEY, value: JSON.stringify(input) });
}

export async function getCharacterMechanicValue(characterId: number, key: string, source: any = db): Promise<number> {
  const rows = await (source.orm.public as any).CharacterStatValue.where({ characterId }).all();
  const value = rows.find((row: any) => String(row.statKey) === key);
  if (value) return Number(value.value) || 0;
  const legacy = await source.orm.public.CharacterStat.where({ characterId }).first();
  return Number(legacy?.[key] ?? 0) || 0;
}
