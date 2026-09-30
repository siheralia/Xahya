import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getUserByRole(roles: string[]) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && roles.includes(String(user.role)) ? user : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  const admin = await getUserByRole(["ADMIN"]);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const characterItemId = Number(body.characterItemId);
  if (!Number.isInteger(characterItemId) || characterItemId <= 0) {
    return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  }

  const flair = body.flair == null ? null : String(body.flair).trim().slice(0, 500);
  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const owned = await CharacterItem.where({ id: characterItemId, characterId }).first();

  if (!owned) {
    return NextResponse.json({ error: "Objeto no encontrado en el inventario." }, { status: 404 });
  }

  const item = await Item.where({ id: Number(owned.itemId) }).first();
  if (!item) {
    return NextResponse.json({ error: "Definición del objeto no encontrada." }, { status: 404 });
  }

  const updated = await CharacterItem.where({ id: characterItemId }).update({ flair });

  await recordAuditEvent({
    actorUserId: admin.id,
    action: "ITEM_FLAIR_UPDATE",
    entityType: "ITEM",
    entityId: Number(item.id),
    characterId,
    details: { characterItemId, itemName: item.name, flair },
  });

  return NextResponse.json({ item: updated });
}


export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  const admin = await getUserByRole(["ADMIN","GM"]);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const characterItemId = Number(body?.characterItemId);
  if (!Number.isInteger(characterItemId) || characterItemId <= 0) {
    return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  }

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const owned = await CharacterItem.where({ id: characterItemId, characterId }).first();
  if (!owned) return NextResponse.json({ error: "Objeto no encontrado en el inventario." }, { status: 404 });

  const item = await Item.where({ id: Number(owned.itemId) }).first();
  if (!item) return NextResponse.json({ error: "Definición del objeto no encontrada." }, { status: 404 });
  if (String(admin.role) === "GM" && String(item.itemType) !== "CONSUMABLE") {
    return NextResponse.json({ error: "GM solo puede eliminar consumibles del inventario." }, { status: 403 });
  }

  await CharacterItem.where({ id: characterItemId }).delete();

  await recordAuditEvent({
    actorUserId: admin.id,
    action: "ITEM_ADMIN_DELETE",
    entityType: "ITEM",
    entityId: Number(item.id),
    characterId,
    details: {
      characterItemId,
      itemName: item.name,
      quantity: Number(owned.quantity),
      equipped: Boolean(owned.equipped),
      equippedSlot: owned.equippedSlot == null ? null : String(owned.equippedSlot),
    },
  });

  return NextResponse.json({ deleted: true, characterItemId });
}
