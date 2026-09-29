import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sourceCharacterId = Number((await params).id);
  const body = await request.json().catch(() => null);
  const targetCharacterId = Number(body?.targetCharacterId);
  const money = Number(body?.money ?? 0);
  const characterItemId = body?.characterItemId == null ? null : Number(body.characterItemId);
  const quantity = Number(body?.quantity ?? 1);

  if (!Number.isInteger(sourceCharacterId) || sourceCharacterId <= 0 || !Number.isInteger(targetCharacterId) || targetCharacterId <= 0 || sourceCharacterId === targetCharacterId) {
    return NextResponse.json({ error: "Personaje de destino inválido." }, { status: 400 });
  }
  if ((!Number.isInteger(money) || money < 0) || (money === 0 && characterItemId == null)) {
    return NextResponse.json({ error: "Indica dinero u objeto para entregar." }, { status: 400 });
  }
  if (money > 0 && characterItemId != null) return NextResponse.json({ error: "Entrega dinero u objeto por separado." }, { status: 400 });
  if (characterItemId != null && (!Number.isInteger(characterItemId) || characterItemId <= 0 || !Number.isInteger(quantity) || quantity < 1)) {
    return NextResponse.json({ error: "Objeto o cantidad inválidos." }, { status: 400 });
  }

  const Character = db.orm.public.Character;
  const source = await Character.where({ id: sourceCharacterId }).first();
  const target = await Character.where({ id: targetCharacterId }).first();
  if (!source || !target) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const privileged = ["GM", "ADMIN"].includes(String(user.role));
  if (!privileged && Number(source.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!privileged) {
    const Relationship = (db.orm.public as any).CharacterRelationship;
    const known = await Relationship.where({ characterId: sourceCharacterId, knownCharacterId: targetCharacterId }).first();
    if (!known) return NextResponse.json({ error: "Tu personaje no conoce a ese personaje." }, { status: 403 });
  }

  const result = await db.transaction(async (tx) => {
    const CharacterResource = tx.orm.public.CharacterResource;
    const sourceResources = await CharacterResource.where({ characterId: sourceCharacterId }).first();
    const targetResources = await CharacterResource.where({ characterId: targetCharacterId }).first();
    if (!sourceResources || !targetResources) throw new Error("RESOURCE_NOT_FOUND");

    if (money > 0) {
      const sourceMoney = Number(sourceResources.money);
      if (sourceMoney < money) throw new Error("NOT_ENOUGH_MONEY");
      await CharacterResource.where({ id: sourceResources.id }).update({ money: sourceMoney - money });
      await CharacterResource.where({ id: targetResources.id }).update({ money: Number(targetResources.money) + money });
      return { kind: "money", money };
    }

    const CharacterItem = (tx.orm.public as any).CharacterItem;
    const owned = await CharacterItem.where({ id: characterItemId, characterId: sourceCharacterId }).first();
    if (!owned) throw new Error("ITEM_NOT_FOUND");
    if (Boolean(owned.equipped)) throw new Error("ITEM_EQUIPPED");
    if (Number(owned.quantity) < quantity) throw new Error("NOT_ENOUGH_ITEMS");

    const Item = (tx.orm.public as any).Item;
    const item = await Item.where({ id: Number(owned.itemId) }).first();
    if (!item) throw new Error("ITEM_DEFINITION_NOT_FOUND");

    const remaining = Number(owned.quantity) - quantity;
    if (remaining === 0) await CharacterItem.where({ id: characterItemId }).delete();
    else await CharacterItem.where({ id: characterItemId }).update({ quantity: remaining });

    const targetOwned = await CharacterItem.where({ characterId: targetCharacterId }).all();
    const matching = targetOwned.find((entry: any) => Number(entry.itemId) === Number(owned.itemId) && String(entry.flair ?? "") === String(owned.flair ?? "") && !Boolean(entry.equipped));
    if (matching) {
      await CharacterItem.where({ id: Number(matching.id) }).update({ quantity: Number(matching.quantity) + quantity });
    } else {
      await CharacterItem.create({ characterId: targetCharacterId, itemId: Number(owned.itemId), quantity, equipped: false, equippedSlot: null, flair: owned.flair ?? null });
    }
    return { kind: "item", itemId: Number(item.id), itemName: item.name, quantity };
  }).catch((error) => {
    if (error instanceof Error) return { error: error.message };
    throw error;
  });

  if ("error" in result) {
    const messages: Record<string, string> = {
      RESOURCE_NOT_FOUND: "Uno de los personajes no tiene recursos registrados.",
      NOT_ENOUGH_MONEY: "No tienes suficiente dinero.",
      ITEM_NOT_FOUND: "Ese objeto no está en el inventario.",
      ITEM_EQUIPPED: "No puedes entregar un objeto equipado.",
      NOT_ENOUGH_ITEMS: "No tienes suficiente cantidad de ese objeto.",
      ITEM_DEFINITION_NOT_FOUND: "La definición del objeto no existe.",
    };
    return NextResponse.json({ error: messages[result.error] ?? "No se pudo completar la entrega." }, { status: 400 });
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: result.kind === "money" ? "CHARACTER_MONEY_TRANSFER" : "CHARACTER_ITEM_TRANSFER",
    entityType: result.kind === "money" ? "CHARACTER" : "ITEM",
    entityId: result.kind === "money" ? targetCharacterId : result.itemId,
    characterId: sourceCharacterId,
    targetUserId: target.userId,
    details: { sourceCharacterId, targetCharacterId, ...result },
  });

  return NextResponse.json(result);
}
