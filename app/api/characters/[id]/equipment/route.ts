import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isEquipmentSlot } from "@/lib/equipment";
import { getPerkSlotCapacity } from "@/lib/perks";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

async function getCharacterAccess(characterId: number) {
  const user = await getUser();
  if (!user) return null;
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return null;
  const allowed = Number(character.userId) === Number(user.id) || ["GM", "ADMIN"].includes(String(user.role));
  return allowed ? { user, character } : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  const access = await getCharacterAccess(characterId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const ownedItems = await CharacterItem.where({ characterId }).all();
  const itemDefinitions = await Item.all();

  const items = ownedItems.map((owned: any) => {
    const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
    return {
      ...owned,
      item: item ?? null,
    };
  });

  return NextResponse.json({ items });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  const access = await getCharacterAccess(characterId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const characterItemId = Number(body.characterItemId);
  const equipped = Boolean(body.equipped);
  const slot = body.slot == null ? null : String(body.slot);
  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const owned = await CharacterItem.where({ id: characterItemId, characterId }).first();

  if (!owned) return NextResponse.json({ error: "Objeto no encontrado en el inventario." }, { status: 404 });

  const item = await Item.where({ id: Number(owned.itemId) }).first();
  if (!item) return NextResponse.json({ error: "Definición del objeto no encontrada." }, { status: 404 });

  if (!equipped) {
    const updated = await CharacterItem.where({ id: characterItemId }).update({
      equipped: false,
      equippedSlot: null,
    });
    await recordAuditEvent({
      actorUserId: access.user.id,
      action: "ITEM_UNEQUIP",
      entityType: "ITEM",
      entityId: Number(item.id),
      characterId,
      details: { characterItemId, itemName: item.name },
    });
    return NextResponse.json({ item: updated });
  }

  if (!isEquipmentSlot(slot)) {
    return NextResponse.json({ error: "Debes seleccionar un slot de equipo válido." }, { status: 400 });
  }

  const allowedSlots = Array.isArray(item.allowedSlots) ? item.allowedSlots.map(String) : [];
  if (!allowedSlots.includes(slot)) {
    return NextResponse.json({ error: "Este objeto no puede equiparse en ese slot." }, { status: 400 });
  }

  const equippedItems = await CharacterItem.where({ characterId }).all();
  const CharacterPerk = (db.orm.public as any).CharacterPerk;
  const Perk = (db.orm.public as any).Perk;
  const characterPerks = CharacterPerk ? await CharacterPerk.where({ characterId }).all() : [];
  const perkDefinitions = Perk ? await Perk.all() : [];
  const perkEntries = characterPerks.map((entry:any) => ({
    ...entry,
    perk: perkDefinitions.find((perk:any) => Number(perk.id) === Number(entry.perkId)) ?? null,
  }));
  const slotCapacity = getPerkSlotCapacity(perkEntries, slot);
  const occupyingItems = equippedItems.filter(
    (candidate:any) =>
      Number(candidate.id) !== characterItemId &&
      Boolean(candidate.equipped) &&
      String(candidate.equippedSlot) === slot,
  );

  // A single-capacity slot replaces its current item automatically.
  // Multi-capacity slots keep their existing occupants.
  if (slotCapacity === 1 && occupyingItems.length > 0) {
    for (const occupyingItem of occupyingItems) {
      await CharacterItem.where({ id: Number(occupyingItem.id) }).update({
        equipped: false,
        equippedSlot: null,
      });
    }
  }

  // A quantity represents a stack of physical copies. Only one physical copy
  // can occupy one equipment slot, so split one copy out of the stack when needed.
  let equippedId = characterItemId;
  let updated: any;

  if (Number(owned.quantity) > 1) {
    await CharacterItem.where({ id: characterItemId }).update({
      quantity: Number(owned.quantity) - 1,
    });

    updated = await CharacterItem.create({
      characterId,
      itemId: Number(owned.itemId),
      quantity: 1,
      equipped: true,
      equippedSlot: slot,
      flair: owned.flair ?? null,
    });
    equippedId = Number(updated.id);
  } else {
    updated = await CharacterItem.where({ id: characterItemId }).update({
      equipped: true,
      equippedSlot: slot,
    });
  }

  await recordAuditEvent({
    actorUserId: access.user.id,
    action: "ITEM_EQUIP",
    entityType: "ITEM",
    entityId: Number(item.id),
    characterId,
    details: { characterItemId: equippedId, itemName: item.name, slot },
  });

  return NextResponse.json({ item: updated });
}
