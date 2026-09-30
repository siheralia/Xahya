import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const characterItemId = Number(body?.characterItemId);
  const quantity = Number(body?.quantity ?? 1);
  if (!Number.isInteger(characterItemId) || characterItemId <= 0) {
    return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return NextResponse.json({ error: "La cantidad debe ser un entero entre 1 y 99." }, { status: 400 });
  }

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const owned = await CharacterItem.where({ id: characterItemId }).first();
  if (!owned) return NextResponse.json({ error: "Objeto no encontrado en el inventario." }, { status: 404 });

  const character = await db.orm.public.Character.where({ id: Number(owned.characterId) }).first();
  if (!character || Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await Item.where({ id: Number(owned.itemId) }).first();
  if (!item) return NextResponse.json({ error: "Definición del objeto no encontrada." }, { status: 404 });

  const ownedQuantity = Number(owned.quantity);
  if (quantity > ownedQuantity) {
    return NextResponse.json({ error: "No tienes suficientes copias de este objeto." }, { status: 400 });
  }

  const storeValue = Number(item.price) > 0
    ? Math.max(1, Math.floor(Number(item.price) / 2))
    : 1;
  const total = storeValue * quantity;

  const result = await db.transaction(async (tx) => {
    const resources = await tx.orm.public.CharacterResource.where({ characterId: Number(character.id) }).first();
    if (!resources) throw new Error("RESOURCE_NOT_FOUND");

    const updatedResources = await tx.orm.public.CharacterResource.where({ id: resources.id }).update({
      money: Number(resources.money) + total,
    });

    const TxCharacterItem = (tx.orm.public as any).CharacterItem;
    if (quantity === ownedQuantity) {
      await TxCharacterItem.where({ id: characterItemId }).delete();
    } else {
      await TxCharacterItem.where({ id: characterItemId }).update({ quantity: ownedQuantity - quantity });
    }

    return {
      updatedResources,
      moneyBefore: Number(resources.money),
      remainingQuantity: ownedQuantity - quantity,
    };
  }).catch((error) => {
    if (error instanceof Error && error.message === "RESOURCE_NOT_FOUND") {
      return { error: "El personaje no tiene recursos registrados." };
    }
    throw error;
  });

  if ("error" in result) return NextResponse.json(result, { status: 400 });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "ITEM_SELL",
    entityType: "ITEM",
    entityId: Number(item.id),
    characterId: Number(character.id),
    details: {
      itemName: item.name,
      characterItemId,
      quantity,
      unitValue: storeValue,
      total,
      moneyBefore: result.moneyBefore,
      moneyAfter: Number(result.updatedResources?.money ?? 0),
    },
  });

  return NextResponse.json({
    money: Number(result.updatedResources?.money ?? 0),
    sold: quantity,
    unitValue: storeValue,
    total,
  });
}