import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user || !["GM", "ADMIN"].includes(String(user.role))) return null;

  return user;
}

export async function GET() {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const Item = (db.orm.public as any).Item;
  const items = await Item.all();

  return NextResponse.json({
    items: items.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name),
      description: item.description == null ? null : String(item.description),
      itemType: String(item.itemType),
      acquisitionType: String(item.acquisitionType),
      allowedSlots: Array.isArray(item.allowedSlots) ? item.allowedSlots : [],
    })),
  });
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const characterId = Number(body?.characterId);
  const itemId = Number(body?.itemId);
  const quantity = Number(body?.quantity ?? 1);
  const flair = body?.flair == null ? null : String(body.flair).trim().slice(0, 500);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return NextResponse.json({ error: "La cantidad debe ser un entero entre 1 y 99." }, { status: 400 });
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const users = await db.orm.public.User.all();
  if (String(manager.role) === "GM") {
    const owner = users.find((user) => user.id === character.userId);
    if (String(owner?.role) === "SYSTEM") {
      return NextResponse.json({ error: "No puedes entregar objetos a personajes del sistema." }, { status: 403 });
    }
  }

  const Item = (db.orm.public as any).Item;
  const item = await Item.where({ id: itemId }).first();
  if (!item) return NextResponse.json({ error: "Objeto no encontrado en el catálogo." }, { status: 404 });

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const owned = await db.transaction(async (tx) => {
    return await (tx.orm.public as any).CharacterItem.create({
      characterId,
      itemId,
      quantity,
      equipped: false,
      equippedSlot: null,
      flair,
    });
  });

  await recordAuditEvent({
    actorUserId: manager.id,
    action: "ITEM_GRANT",
    entityType: "ITEM",
    entityId: itemId,
    characterId,
    details: {
      characterItemId: Number(owned.id),
      itemName: String(item.name),
      quantity,
      flair,
      acquisitionType: String(item.acquisitionType),
    },
  });

  return NextResponse.json({ owned });
}
