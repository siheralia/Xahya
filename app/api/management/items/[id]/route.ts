import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EQUIPMENT_SLOTS } from "@/lib/equipment";

const EFFECT_TYPES = ["stat_multiplier", "stat_bonus"] as const;
const EFFECT_STATS = ["STR", "AGI", "CON", "INT", "WIS", "CHA", "SPI", "LCK", "PHYS_ATK", "MAGIC_ATK", "DEF", "MAG_DEF", "STEALTH", "ATTACK_TOTAL", "DAMAGE_REDUCTION_ALL"] as const;

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((user) => user.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  const Item = (db.orm.public as any).Item;
  const item = await Item.where({ id }).first();
  if (!item) return NextResponse.json({ error: "Objeto no encontrado." }, { status: 404 });
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const itemType = String(body.itemType ?? item.itemType);
  const acquisitionType = String(body.acquisitionType ?? item.acquisitionType);
  const price = Number(body.price ?? item.price);
  const effects = Array.isArray(body.effects) ? body.effects : item.effects;
  const allowedSlots = Array.isArray(body.allowedSlots) ? body.allowedSlots.map(String) : (Array.isArray(item.allowedSlots) ? item.allowedSlots : []);
  if (!name || name.length > 100 || !Number.isInteger(price) || price < 0) return NextResponse.json({ error: "Datos del objeto inválidos." }, { status: 400 });
  if (allowedSlots.some((slot: string) => !EQUIPMENT_SLOTS.includes(slot as any))) return NextResponse.json({ error: "Slots de equipo inválidos." }, { status: 400 });
  for (const effect of effects) {
    if (!EFFECT_TYPES.includes(String(effect?.type) as any) || !EFFECT_STATS.includes(String(effect?.stat) as any) || !Number.isFinite(Number(effect?.value)) || Number(effect.value) <= 0) return NextResponse.json({ error: "Efecto de objeto inválido." }, { status: 400 });
  }
  const updated = await Item.where({ id }).update({ name, description, itemType, acquisitionType, price, effects, allowedSlots });
  await recordAuditEvent({ actorUserId: admin.id, action: "ITEM_UPDATE", entityType: "ITEM", entityId: id, details: { before: item, after: updated } });
  return NextResponse.json({ item: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  const Item = (db.orm.public as any).Item;
  const item = await Item.where({ id }).first();
  if (!item) return NextResponse.json({ error: "Objeto no encontrado." }, { status: 404 });
  await Item.where({ id }).delete();
  await recordAuditEvent({ actorUserId: admin.id, action: "ITEM_DELETE", entityType: "ITEM", entityId: id, details: { name: item.name } });
  return NextResponse.json({ success: true });
}