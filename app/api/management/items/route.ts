import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EQUIPMENT_SLOTS } from "@/lib/equipment";

const ITEM_TYPES = ["WEAPON","ARMOR","ACCESSORY","CONSUMABLE","MATERIAL","OTHER"] as const;
const ACQUISITION_TYPES = ["PURCHASABLE","CRAFTED","ABILITY_GENERATED","QUEST","EVENT","OTHER"] as const;
const EFFECT_TYPES = ["stat_multiplier","stat_bonus"] as const;
const EFFECT_STATS = ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK","ATTACK_TOTAL","DAMAGE_REDUCTION_ALL"] as const;

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((user) => user.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

function validate(body: any) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const itemType = String(body.itemType ?? "OTHER");
  const acquisitionType = String(body.acquisitionType ?? "PURCHASABLE");
  const price = Number(body.price ?? 0);
  const effects = Array.isArray(body.effects) ? body.effects : [];
  const allowedSlots = Array.isArray(body.allowedSlots) ? body.allowedSlots.map(String) : ["ACCESSORY"];
  if (!name || name.length > 100) return "El nombre debe tener entre 1 y 100 caracteres.";
  if (!ITEM_TYPES.includes(itemType as any)) return "Tipo de objeto inválido.";
  if (!ACQUISITION_TYPES.includes(acquisitionType as any)) return "Tipo de obtención inválido.";
  if (!Number.isInteger(price) || price < 0) return "El precio debe ser un entero no negativo.";
  if (!allowedSlots.length || allowedSlots.some((slot: string) => !EQUIPMENT_SLOTS.includes(slot as any))) return "Slots de equipo inválidos.";
  for (const effect of effects) {
    if (!EFFECT_TYPES.includes(String(effect?.type) as any)) return "Efecto de objeto inválido.";
    if (!EFFECT_STATS.includes(String(effect?.stat) as any)) return "Estadística de efecto inválida.";
    if (!Number.isFinite(Number(effect?.value)) || Number(effect.value) <= 0) return "Valor de efecto inválido.";
  }
  return null;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const Item = (db.orm.public as any).Item;
  const items = await Item.all();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const Item = (db.orm.public as any).Item;
  const allowedSlots = Array.isArray(body.allowedSlots) ? body.allowedSlots.map(String) : ["ACCESSORY"];
  const item = await Item.create({
    name: body.name.trim(),
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    itemType: String(body.itemType),
    acquisitionType: String(body.acquisitionType),
    price: Number(body.price ?? 0),
    effects: body.effects,
    allowedSlots,
  });
  await recordAuditEvent({ actorUserId: admin.id, action: "ITEM_CREATE", entityType: "ITEM", entityId: Number(item.id), details: { name: item.name, itemType: item.itemType, acquisitionType: item.acquisitionType } });
  return NextResponse.json({ item });
}

export { ITEM_TYPES, ACQUISITION_TYPES, EFFECT_TYPES };