import { db } from "@/lib/db";
import {calculateConfiguredDerivedSnapshot} from "@/lib/stats/configured-derived-pure";
import { calculateDerivedStats, type BaseStats } from "@/lib/stats/derived";

type StatDefinition = {
  key: string; name: string; code: string; kind: "basic" | "derived";
  active: boolean; defaultValue?: number; formula?: string; order?: number;
};
type DbLike = typeof db | any;
const SETTING_KEY = "statistics.catalog.v1";

async function readDefinitions(source: DbLike): Promise<StatDefinition[]> {
  try {
    const Setting = (source.orm.public as any).AppSetting;
    const row = Setting ? await Setting.where({ key: SETTING_KEY }).first() : null;
    const parsed = row?.value ? JSON.parse(String(row.value)) : null;
    if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry.key === "string");
  } catch {
    // A malformed or unavailable catalog must not take down character sheets.
  }
  return [];
}

/** Shared configured formula evaluator is pure and deterministic; the sheet
 * and combat snapshots now execute exactly the same expression semantics. */
export async function calculateConfiguredDerivedStats(
  stats: BaseStats & Record<string, number>,
  source: DbLike = db,
): Promise<ReturnType<typeof calculateDerivedStats> & Record<string, number>> {
  const definitions=await readDefinitions(source);
  return calculateConfiguredDerivedSnapshot(stats,definitions);
}
