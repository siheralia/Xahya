import { db } from "@/lib/db";
import { EFFECT_CATALOG } from "@/lib/effects/catalog";
import { readNarrativeEffectCards } from "@/lib/effects/narrative-cards";
import { readEffectPricing } from "@/lib/effects/pricing";
import { defaultEffectPricing } from "@/lib/skills/pch";

const KEY = "skills.mechanical-effect-metadata.v1";
export type MechanicalMetadata = { label: string; description: string };
export type MechanicalMetadataMap = Record<string, MechanicalMetadata>;

/** Runtime mechanics stay registered in code; their player-facing metadata lives in AppSetting. */
export async function readMechanicalMetadata(): Promise<MechanicalMetadataMap> {
  const row = await db.orm.public.AppSetting.where({ key: KEY }).first();
  if (!row?.value) return {};
  try {
    const parsed: unknown = JSON.parse(String(row.value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: MechanicalMetadataMap = {};
    for (const entry of EFFECT_CATALOG) {
      const value = (parsed as Record<string, unknown>)[entry.type];
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      if (typeof record.label !== "string" || !record.label.trim() || record.label.length > 100) continue;
      if (typeof record.description !== "string" || record.description.length > 2000) continue;
      result[entry.type] = { label: record.label.trim(), description: record.description.trim() };
    }
    return result;
  } catch { return {}; }
}
export async function writeMechanicalMetadata(metadata: MechanicalMetadataMap) {
  const Setting = db.orm.public.AppSetting;
  const value = JSON.stringify(metadata);
  const row = await Setting.where({ key: KEY }).first();
  if (row) await Setting.where({ key: KEY }).update({ value });
  else await Setting.create({ key: KEY, value });
}
export async function readManagedEffectCatalog() {
  const [metadata, narrativeCards, savedPricing] = await Promise.all([
    readMechanicalMetadata(), readNarrativeEffectCards(), readEffectPricing(),
  ]);
  const pricing = { ...defaultEffectPricing(), ...savedPricing };
  return {
    effects: EFFECT_CATALOG.map(entry => ({
      type: entry.type,
      label: metadata[entry.type]?.label ?? entry.label,
      description: metadata[entry.type]?.description ?? "",
      mode: entry.mode,
      targets: entry.targets,
      enabled: pricing[entry.type]?.enabled !== false,
    })),
    narrativeCards,
    pricing,
  };
}
