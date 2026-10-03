import { db } from "@/lib/db";

export const STORE_PROMOTIONS_KEY = "store_promotions_v1";
export const STORE_TIME_ZONE = "America/Chihuahua";

export type StorePromotionCondition = {
  itemId?: number | null;
  itemType?: string | null;
  itemSubtype?: string | null;
  slot?: string | null;
  stat?: string | null;
  daysOfWeek?: number[];
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type StorePromotion = {
  id: number;
  name: string;
  description?: string | null;
  active: boolean;
  adjustmentType: "PERCENT" | "FIXED";
  adjustmentValue: number;
  priority: number;
  condition: StorePromotionCondition;
  createdAt?: string;
  updatedAt?: string;
};

export type StorePriceResult = {
  basePrice: number;
  price: number;
  appliedPromotions: StorePromotion[];
};

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[get("weekday")] ?? 0;

  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    weekday,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function timeMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function timeMatches(condition: StorePromotionCondition, currentMinutes: number) {
  const start = timeMinutes(condition.startTime);
  const end = timeMinutes(condition.endTime);
  if (start === null && end === null) return true;
  if (start === null || end === null) return false;
  if (start <= end) return currentMinutes >= start && currentMinutes <= end;
  return currentMinutes >= start || currentMinutes <= end;
}

function dateMatches(condition: StorePromotionCondition, date: string) {
  if (condition.startDate && date < condition.startDate) return false;
  if (condition.endDate && date > condition.endDate) return false;
  return true;
}

function itemMatches(condition: StorePromotionCondition, item: any) {
  if (condition.itemId != null && Number(condition.itemId) !== Number(item.id)) return false;
  if (condition.itemType && condition.itemType !== String(item.itemType)) return false;
  if (condition.itemSubtype && condition.itemSubtype !== String(item.itemSubtype ?? "")) return false;
  if (condition.slot && !(Array.isArray(item.allowedSlots) && item.allowedSlots.map(String).includes(condition.slot))) return false;
  if (condition.stat) {
    const effects = Array.isArray(item.effects) ? item.effects : [];
    const hasStat = effects.some((effect: any) => {
      const stat = String(effect?.stat ?? "");
      return stat === condition.stat || (condition.stat === "ATTACK_TOTAL" && String(effect?.type ?? "") === "attack_multiplier_all");
    });
    if (!hasStat) return false;
  }
  return true;
}

export function promotionMatches(promotion: StorePromotion, item: any, date = new Date()) {
  if (!promotion.active) return false;

  const condition = promotion.condition ?? {};
  const current = localParts(date);

  if (!itemMatches(condition, item)) return false;
  if (!dateMatches(condition, current.date)) return false;
  if (Array.isArray(condition.daysOfWeek) && condition.daysOfWeek.length > 0 && !condition.daysOfWeek.includes(current.weekday)) return false;
  if (!timeMatches(condition, current.minutes)) return false;

  return true;
}

export function calculateStorePrice(item: any, promotions: StorePromotion[], date = new Date()): StorePriceResult {
  const basePrice = Math.max(0, Math.trunc(Number(item.price) || 0));
  const appliedPromotions = promotions
    .filter((promotion) => promotionMatches(promotion, item, date))
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0) || Number(a.id) - Number(b.id));

  let price = basePrice;
  for (const promotion of appliedPromotions) {
    if (promotion.adjustmentType === "PERCENT") {
      price = Math.max(0, Math.round(price * (1 + Number(promotion.adjustmentValue) / 100)));
    } else {
      price = Math.max(0, Math.round(price + Number(promotion.adjustmentValue)));
    }
  }

  return { basePrice, price, appliedPromotions };
}

function normalizePromotion(value: unknown): StorePromotion | null {
  if (!value || typeof value !== "object") return null;
  const promotion = value as Record<string, unknown>;
  const id = Number(promotion.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const adjustmentType: StorePromotion["adjustmentType"] =
    promotion.adjustmentType === "FIXED" ? "FIXED" : "PERCENT";

  const rawCondition = promotion.condition;
  const conditionObject = rawCondition && typeof rawCondition === "object"
    ? rawCondition as Record<string, unknown>
    : {};

  const rawDays = Array.isArray(conditionObject.daysOfWeek) ? conditionObject.daysOfWeek : [];
  const daysOfWeek: number[] = rawDays
    .map((day: unknown) => Number(day))
    .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6);

  return {
    id,
    name: String(promotion.name ?? "Regla sin nombre"),
    description: promotion.description == null ? null : String(promotion.description),
    active: Boolean(promotion.active),
    adjustmentType,
    adjustmentValue: Number(promotion.adjustmentValue ?? 0),
    priority: Number(promotion.priority ?? 0),
    condition: {
      itemId: Number.isInteger(Number(conditionObject.itemId)) && Number(conditionObject.itemId) > 0 ? Number(conditionObject.itemId) : null,
      itemType: conditionObject.itemType ? String(conditionObject.itemType) : null,
      itemSubtype: conditionObject.itemSubtype ? String(conditionObject.itemSubtype) : null,
      slot: conditionObject.slot ? String(conditionObject.slot) : null,
      stat: conditionObject.stat ? String(conditionObject.stat) : null,
      daysOfWeek: Array.from(new Set<number>(daysOfWeek)),
      startDate: conditionObject.startDate ? String(conditionObject.startDate) : null,
      endDate: conditionObject.endDate ? String(conditionObject.endDate) : null,
      startTime: conditionObject.startTime ? String(conditionObject.startTime) : null,
      endTime: conditionObject.endTime ? String(conditionObject.endTime) : null,
    },
    createdAt: promotion.createdAt == null ? undefined : String(promotion.createdAt),
    updatedAt: promotion.updatedAt == null ? undefined : String(promotion.updatedAt),
  };
}

export async function loadStorePromotions(): Promise<StorePromotion[]> {
  const AppSetting = (db.orm.public as any).AppSetting;
  const setting = await AppSetting.where({ key: STORE_PROMOTIONS_KEY }).first();
  if (!setting?.value) return [];

  try {
    const parsed: unknown = JSON.parse(String(setting.value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePromotion).filter((promotion): promotion is StorePromotion => promotion !== null);
  } catch {
    return [];
  }
}
