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
  const characterId = Number(body?.characterId), itemId = Number(body?.itemId), quantity = Number(body?.quantity ?? 1);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: "Objeto inválido." }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return NextResponse.json({ error: "La cantidad debe ser un entero entre 1 y 99." }, { status: 400 });

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character || Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const Item = (db.orm.public as any).Item;
  const item = await Item.where({ id: itemId }).first();
  if (!item || String(item.acquisitionType) !== "PURCHASABLE") return NextResponse.json({ error: "Este objeto no está disponible en la tienda." }, { status: 400 });

  const price = Number(item.price), total = price * quantity;
  const result = await db.transaction(async (tx) => {
    const resources = await tx.orm.public.CharacterResource.where({ characterId }).first();
    if (!resources) throw new Error("RESOURCE_NOT_FOUND");
    const money = Number(resources.money);
    if (money < total) throw new Error("NOT_ENOUGH_MONEY");
    const updatedResources = await tx.orm.public.CharacterResource.where({ id: resources.id }).update({ money: money - total });
    const CharacterItem = (tx.orm.public as any).CharacterItem;
    const owned = await CharacterItem.create({ characterId, itemId, quantity, equipped: false, equippedSlot: null });
    return { updatedResources, owned, moneyBefore: money };
  }).catch((error) => {
    if (error instanceof Error && error.message === "NOT_ENOUGH_MONEY") return { error: "No tienes suficiente dinero." };
    if (error instanceof Error && error.message === "RESOURCE_NOT_FOUND") return { error: "El personaje no tiene recursos registrados." };
    throw error;
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  await recordAuditEvent({ actorUserId: user.id, action: "ITEM_PURCHASE", entityType: "ITEM", entityId: itemId, characterId,
    details: { itemName: item.name, quantity, unitPrice: price, total, moneyBefore: result.moneyBefore, moneyAfter: Number(result.updatedResources?.money ?? 0) } });
  return NextResponse.json({ money: Number(result.updatedResources?.money ?? 0), owned: result.owned });
}
