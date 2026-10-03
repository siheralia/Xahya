import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadStorePromotions, STORE_PROMOTIONS_KEY, type StorePromotion, type StorePromotionCondition } from "@/lib/store-pricing";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((entry) => entry.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

function normalizeCondition(value: any): StorePromotionCondition {
  const rawDays: number[] = Array.isArray(value?.daysOfWeek) ? value.daysOfWeek.map((day: unknown) => Number(day)) : [];
  const days: number[] = Array.from(new Set<number>(rawDays.filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)));

  const cleanTime = (raw: unknown) => {
    const value = String(raw ?? "");
    return /^\d{2}:\d{2}$/.test(value) ? value : null;
  };

  const cleanDate = (raw: unknown) => {
    const value = String(raw ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  };

  return {
    itemId: Number.isInteger(Number(value?.itemId)) && Number(value.itemId) > 0 ? Number(value.itemId) : null,
    itemType: value?.itemType ? String(value.itemType) : null,
    itemSubtype: value?.itemSubtype ? String(value.itemSubtype) : null,
    slot: value?.slot ? String(value.slot) : null,
    stat: value?.stat ? String(value.stat) : null,
    daysOfWeek: days,
    startDate: cleanDate(value?.startDate),
    endDate: cleanDate(value?.endDate),
    startTime: cleanTime(value?.startTime),
    endTime: cleanTime(value?.endTime),
  };
}

function validatePromotion(body: any) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return "El nombre debe tener entre 1 y 100 caracteres.";

  const adjustmentType = body?.adjustmentType === "FIXED" ? "FIXED" : body?.adjustmentType === "PERCENT" ? "PERCENT" : null;
  if (!adjustmentType) return "Tipo de ajuste inválido.";

  const adjustmentValue = Number(body?.adjustmentValue);
  if (!Number.isFinite(adjustmentValue)) return "El ajuste debe ser un número.";
  if (adjustmentType === "PERCENT" && (adjustmentValue < -100 || adjustmentValue > 1000)) return "El porcentaje debe estar entre -100% y +1000%.";
  if (adjustmentType === "FIXED" && !Number.isInteger(adjustmentValue)) return "El ajuste fijo debe ser un número entero.";

  const condition = normalizeCondition(body?.condition);
  if (condition.startDate && condition.endDate && condition.startDate > condition.endDate) return "La fecha inicial no puede ser posterior a la fecha final.";
  if ((condition.startTime && !condition.endTime) || (!condition.startTime && condition.endTime)) return "Debes indicar la hora inicial y final.";
  return null;
}

async function savePromotions(promotions: StorePromotion[]) {
  const AppSetting = (db.orm.public as any).AppSetting;
  const value = JSON.stringify(promotions);
  const setting = await AppSetting.where({ key: STORE_PROMOTIONS_KEY }).first();
  if (setting) await AppSetting.where({ id: Number(setting.id) }).update({ value });
  else await AppSetting.create({ key: STORE_PROMOTIONS_KEY, value });
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const Item = (db.orm.public as any).Item;
  const [promotions, items] = await Promise.all([
    loadStorePromotions(),
    Item.where({ acquisitionType: "PURCHASABLE" }).all(),
  ]);

  return NextResponse.json({
    promotions,
    items: items.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name),
      itemType: String(item.itemType),
      itemSubtype: item.itemSubtype == null ? null : String(item.itemSubtype),
      allowedSlots: Array.isArray(item.allowedSlots) ? item.allowedSlots : [],
      effects: Array.isArray(item.effects) ? item.effects : [],
      price: Number(item.price),
    })),
  });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const error = validatePromotion(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const promotions = await loadStorePromotions();
  const now = new Date().toISOString();
  const nextId = promotions.reduce((max, promotion) => Math.max(max, Number(promotion.id) || 0), 0) + 1;

  const adjustmentType: StorePromotion["adjustmentType"] = body.adjustmentType === "FIXED" ? "FIXED" : "PERCENT";
  const promotion: StorePromotion = {
    id: nextId,
    name: body.name.trim(),
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    active: body.active !== false,
    adjustmentType,
    adjustmentValue: Number(body.adjustmentValue),
    priority: Number.isInteger(Number(body.priority)) ? Number(body.priority) : 0,
    condition: normalizeCondition(body.condition),
    createdAt: now,
    updatedAt: now,
  };

  promotions.push(promotion);
  await savePromotions(promotions);

  return NextResponse.json({ promotion }, { status: 201 });
}
