import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EQUIPMENT_SLOTS } from "@/lib/equipment";
import { EFFECT_TYPES } from "@/lib/effects/catalog";

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
  const itemSubtype = typeof body.itemSubtype === "string" ? body.itemSubtype.trim() || null : (item.itemSubtype ?? null);
  const acquisitionType = String(body.acquisitionType ?? item.acquisitionType);
  const price = Number(body.price ?? item.price);
  const effects = Array.isArray(body.effects) ? body.effects : item.effects;
  const allowedSlots = Array.isArray(body.allowedSlots) ? body.allowedSlots.map(String) : (Array.isArray(item.allowedSlots) ? item.allowedSlots : []);
  const systemActions = ["ESCAPE_MAZE", "DISARM_MAZE_TRAP", "RELEASE_MAZE_TRAPPED", "CREATE_SKILL"];
  if (!name || name.length > 100 || !Number.isInteger(price) || price < 0) return NextResponse.json({ error: "Datos del objeto inválidos." }, { status: 400 });
  if (allowedSlots.some((slot: string) => !EQUIPMENT_SLOTS.includes(slot as any))) return NextResponse.json({ error: "Slots de equipo inválidos." }, { status: 400 });
  for (const effect of effects) {
    if (!effect || typeof effect !== "object" || typeof effect.type !== "string" || !effect.type.trim() || !Number.isFinite(Number(effect.value)) || Number(effect.value) <= 0) return NextResponse.json({ error: "Efecto de objeto inválido." }, { status: 400 });
    if (effect.type === "system_action") {
      if (itemType !== "CONSUMABLE" || !systemActions.includes(String(effect.action))) return NextResponse.json({ error: "Acción del sistema inválida para este objeto." }, { status: 400 });
    } else if ((!EFFECT_TYPES.includes(String(effect.type).toUpperCase() as (typeof EFFECT_TYPES)[number]) && effect.type !== "system_action") || (EFFECT_TYPES.includes(String(effect.type).toUpperCase() as (typeof EFFECT_TYPES)[number]) && typeof effect.stat !== "string" && !String(effect.type).includes("DEF_") && !String(effect.type).includes("FINAL_DAMAGE"))) {
      return NextResponse.json({ error: "Efecto de objeto inválido." }, { status: 400 });
    }
  }
  const updated = await Item.where({ id }).update({ name, description, itemType, itemSubtype, acquisitionType, price, effects, allowedSlots });
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