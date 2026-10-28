import { db } from "@/lib/db";
import { readStatisticsCatalog } from "@/lib/stats/dynamic";
const KEY = "skills.default-attack-speed-stat.v1";
export const DEFAULT_ATTACK_SPEED_STAT = "agility";
export async function availableAttackSpeedStats() {
  const custom = (await readStatisticsCatalog()).filter(s => s.kind === "basic" && s.active !== false).map(s => ({ key: s.key, name: s.name }));
  return [{ key: "agility", name: "Agilidad" }, ...custom.filter(s => s.key !== "agility")];
}
export async function readDefaultAttackSpeedStat(): Promise<string> {
  const row = await db.orm.public.AppSetting.where({ key: KEY }).first();
  const available = await availableAttackSpeedStats();
  const key = String(row?.value ?? DEFAULT_ATTACK_SPEED_STAT);
  return available.some(s => s.key === key) ? key : DEFAULT_ATTACK_SPEED_STAT;
}
export async function writeDefaultAttackSpeedStat(key: string) {
  const available = await availableAttackSpeedStats();
  if (!available.some(s => s.key === key)) throw new Error("Invalid speed statistic");
  const Setting = db.orm.public.AppSetting;
  const row = await Setting.where({ key: KEY }).first();
  if (row) await Setting.where({ key: KEY }).update({ value: key });
  else await Setting.create({ key: KEY, value: key });
}
export const SPEED_OVERRIDE_PCH = 5;
export function speedSurcharge(speed: string | null | undefined): number {
  return !speed || speed === "DEFAULT" ? 0 : SPEED_OVERRIDE_PCH;
}
