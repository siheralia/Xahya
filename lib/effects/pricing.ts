import { db } from "@/lib/db";
import { BASE_COST, type EffectPricing } from "@/lib/skills/pch";

export const EFFECT_PRICING_KEY = "skills.effect-pricing.v1";

export async function readEffectPricing(): Promise<Record<string, EffectPricing>> {
  const Setting = db.orm.public.AppSetting;
  const row = await Setting.where({ key: EFFECT_PRICING_KEY }).first();
  if (!row?.value) return {};
  try {
    const parsed: unknown = JSON.parse(String(row.value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, EffectPricing> = {};
    for (const [type, raw] of Object.entries(parsed)) {
      if (!(type in BASE_COST) || !raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      if (!Number.isSafeInteger(entry.base) || Number(entry.base) < 0 || Number(entry.base) > 100000) continue;
      if (!Number.isSafeInteger(entry.step) || Number(entry.step) < 0 || Number(entry.step) > 100000) continue;
      if (typeof entry.enabled !== "boolean") continue;
      result[type] = { base: Number(entry.base), step: Number(entry.step), enabled: entry.enabled };
    }
    return result;
  } catch { return {}; }
}

export async function writeEffectPricing(pricing: Record<string, EffectPricing>) {
  const Setting = db.orm.public.AppSetting;
  const value = JSON.stringify(pricing);
  const row = await Setting.where({ key: EFFECT_PRICING_KEY }).first();
  if (row) await Setting.where({ key: EFFECT_PRICING_KEY }).update({ value });
  else await Setting.create({ key: EFFECT_PRICING_KEY, value });
}
