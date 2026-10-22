import { db } from "@/lib/db";

export type BasicStatDefinition = {
  key: string;
  name: string;
  code: string;
  kind: "basic" | "derived";
  active?: boolean;
  showOnSheet?: boolean;
  showOnPolygon?: boolean;
  defaultValue?: number;
  formula?: string;
  order?: number;
};

export const CORE_BASIC_STAT_KEYS = new Set(["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"]);

export async function readStatisticsCatalog(source: any = db): Promise<BasicStatDefinition[]> {
  try {
    const Setting = (source.orm.public as any).AppSetting;
    const row = Setting ? await Setting.where({ key: "statistics.catalog.v1" }).first() : null;
    if (!row?.value) return [];
    const parsed = JSON.parse(String(row.value));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.key === "string") : [];
  } catch {
    return [];
  }
}

export async function getCustomBasicDefinitions(source: any = db): Promise<BasicStatDefinition[]> {
  const catalog = await readStatisticsCatalog(source);
  return catalog
    .filter((entry) => entry.kind === "basic" && entry.active !== false && !CORE_BASIC_STAT_KEYS.has(entry.key))
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

export async function getCharacterCustomBasicStats(characterId: number, source: any = db) {
  const definitions = await getCustomBasicDefinitions(source);
  const Model = (source.orm.public as any).CharacterStatValue;
  const rows = Model ? await Model.where({ characterId }).all() : [];
  const values: Record<string, number> = {};
  for (const definition of definitions) {
    const row = rows.find((entry: any) => String(entry.statKey) === definition.key);
    const value = Number(row?.value ?? definition.defaultValue ?? 0);
    values[definition.key] = Number.isFinite(value) ? value : 0;
  }
  return { definitions, values, rows };
}

/** Create missing per-character values without overwriting values already assigned. */
export async function initializeCharacterCustomBasicStats(characterId: number, source: any = db) {
  const definitions = await getCustomBasicDefinitions(source);
  const Model = (source.orm.public as any).CharacterStatValue;
  if (!Model || !definitions.length) return;
  const rows = await Model.where({ characterId }).all();
  for (const definition of definitions) {
    if (rows.some((row: any) => String(row.statKey) === definition.key)) continue;
    await Model.create({
      characterId,
      statKey: definition.key,
      value: Math.trunc(Number(definition.defaultValue ?? 0) || 0),
    });
  }
}

/** Keep the normalized table synchronized while legacy readers still use CharacterStat. */
export async function syncCharacterCoreBasicStats(
  characterId: number,
  values: Record<string, number>,
  source: any = db
) {
  const Model = (source.orm.public as any).CharacterStatValue;
  if (!Model) throw new Error("CharacterStatValue model unavailable");
  const rows = await Model.where({ characterId }).all();
  for (const key of CORE_BASIC_STAT_KEYS) {
    const value = values[key];
    if (!Number.isInteger(value)) throw new Error(`Invalid basic stat: ${key}`);
    const existing = rows.find((row: any) => String(row.statKey) === key);
    if (existing) await Model.where({ id: Number(existing.id) }).update({ value });
    else await Model.create({ characterId, statKey: key, value });
  }
}
