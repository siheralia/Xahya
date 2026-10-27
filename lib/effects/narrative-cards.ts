import { db } from "@/lib/db";

export type NarrativeEffectCard = { id: string; name: string; description: string; category: string; icon: string; pch: number; enabled: boolean };
const KEY = "skills.narrative-effect-cards.v1";
export async function readNarrativeEffectCards(): Promise<NarrativeEffectCard[]> {
  const row = await db.orm.public.AppSetting.where({ key: KEY }).first();
  if (!row?.value) return [];
  try {
    const parsed: unknown = JSON.parse(String(row.value));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is NarrativeEffectCard => Boolean(v && typeof v.id === "string" && typeof v.name === "string" && typeof v.description === "string" && typeof v.pch === "number" && Number.isSafeInteger(v.pch) && v.pch >= 0 && typeof v.enabled === "boolean" && typeof v.category === "string" && typeof v.icon === "string")).slice(0, 500);
  } catch { return []; }
}
export async function writeNarrativeEffectCards(cards: NarrativeEffectCard[]) {
  const Setting = db.orm.public.AppSetting;
  const row = await Setting.where({ key: KEY }).first();
  if (row) await Setting.where({ key: KEY }).update({ value: JSON.stringify(cards) });
  else await Setting.create({ key: KEY, value: JSON.stringify(cards) });
}
