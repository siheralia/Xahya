import { EFFECT_WISHLIST } from "@/lib/effects/wishlist";
import { db } from "@/lib/db";

export type NarrativeEffectCard = { id: string; name: string; description: string; category: string; icon: string; pch: number; enabled: boolean };
const KEY = "skills.narrative-effect-cards.v1";
export const BUILTIN_NARRATIVE_CARDS: NarrativeEffectCard[] = EFFECT_WISHLIST.map(effect => ({ id: effect.id, name: effect.name, description: effect.description, category: effect.category, icon: "sparkles", pch: 5, enabled: true }));
export async function readNarrativeEffectCards(): Promise<NarrativeEffectCard[]> {
  const builtin = BUILTIN_NARRATIVE_CARDS;
  const row = await db.orm.public.AppSetting.where({ key: KEY }).first();
  if (!row?.value) return builtin;
  try {
    const parsed: unknown = JSON.parse(String(row.value));
    if (!Array.isArray(parsed)) return builtin;
    const saved = parsed.filter((v): v is NarrativeEffectCard => Boolean(v && typeof v.id === "string" && typeof v.name === "string" && typeof v.description === "string" && typeof v.pch === "number" && Number.isSafeInteger(v.pch) && v.pch >= 0 && typeof v.enabled === "boolean" && typeof v.category === "string" && typeof v.icon === "string")).slice(0, 500);
    return [...builtin.map(card => saved.find(v => v.id === card.id) ?? card), ...saved.filter(card => !builtin.some(v => v.id === card.id))];
  } catch { return builtin; }
}
export async function writeNarrativeEffectCards(cards: NarrativeEffectCard[]) {
  const Setting = db.orm.public.AppSetting;
  const row = await Setting.where({ key: KEY }).first();
  if (row) await Setting.where({ key: KEY }).update({ value: JSON.stringify(cards) });
  else await Setting.create({ key: KEY, value: JSON.stringify(cards) });
}
