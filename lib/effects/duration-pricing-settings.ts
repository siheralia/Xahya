import { db } from "@/lib/db";
import { DEFAULT_DURATION_PRICING, validateDurationPricing, type DurationPricing } from "./duration-pricing";

const KEY = "skills.duration-pricing.v1";
export async function readDurationPricing(): Promise<DurationPricing> {
  const row = await db.orm.public.AppSetting.where({key: KEY}).first();
  if (!row?.value) return DEFAULT_DURATION_PRICING;
  try {
    const value = JSON.parse(String(row.value)) as DurationPricing;
    if (!value || typeof value !== "object") throw new Error("Invalid pricing");
    validateDurationPricing(value);
    return value;
  } catch { return DEFAULT_DURATION_PRICING; }
}
export async function writeDurationPricing(value: DurationPricing): Promise<void> {
  validateDurationPricing(value);
  const Setting = db.orm.public.AppSetting;
  const row = await Setting.where({key: KEY}).first();
  if (row) await Setting.where({key: KEY}).update({value: JSON.stringify(value)});
  else await Setting.create({key: KEY,value: JSON.stringify(value)});
}
