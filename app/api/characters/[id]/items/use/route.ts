import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

const SYSTEM_ACTIONS = ["ESCAPE_MAZE", "DISARM_MAZE_TRAP", "RELEASE_MAZE_TRAPPED"] as const;

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const characterId = Number((await params).id);
  const body = await request.json().catch(() => null);
  const characterItemId = Number(body?.characterItemId);

  if (!Number.isInteger(characterId) || characterId <= 0 || !Number.isInteger(characterItemId) || characterItemId <= 0) {
    return NextResponse.json({ error: "Objeto o personaje inválido." }, { status: 400 });
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character || Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;
  const owned = await CharacterItem.where({ id: characterItemId, characterId }).first();
  if (!owned) return NextResponse.json({ error: "Objeto no encontrado en el inventario." }, { status: 404 });

  const quantity = Number(owned.quantity);
  if (quantity < 1) return NextResponse.json({ error: "No tienes copias disponibles de este objeto." }, { status: 400 });

  const item = await Item.where({ id: Number(owned.itemId) }).first();
  if (!item) return NextResponse.json({ error: "Definición del objeto no encontrada." }, { status: 404 });
  if (String(item.itemType) !== "CONSUMABLE") {
    return NextResponse.json({ error: "Solo puedes usar consumibles." }, { status: 400 });
  }

  const effects = Array.isArray(item.effects) ? item.effects : [];
  const systemEffect = effects.find((effect: any) => effect && effect.type === "system_action");
  const action = String(systemEffect?.action ?? "");
  if (!SYSTEM_ACTIONS.includes(action as any)) {
    return NextResponse.json({ error: "Este consumible es narrativo y no tiene una acción automática del sistema." }, { status: 400 });
  }

  if (action === "DISARM_MAZE_TRAP" || action === "RELEASE_MAZE_TRAPPED") {
    const Position = (db.orm.public as any).MazeCharacterPosition;
    const position = await Position.where({ characterId }).first();
    if (!position) return NextResponse.json({ error: "No estás dentro de un laberinto." }, { status: 400 });

    const room = await db.orm.public.MazeRoom.where({
      id: Number(position.roomId),
      mazeId: Number(position.mazeId),
    }).first();
    if (!room) return NextResponse.json({ error: "No se encontró tu habitación actual." }, { status: 404 });
    if (String(room.roomType) !== "TRAP") {
      return NextResponse.json({ error: "Este objeto solo puede usarse dentro de una habitación de trampa." }, { status: 400 });
    }

    const trapped = String(position.status ?? "ACTIVE") === "TRAPPED";
    if (!trapped) return NextResponse.json({ error: "Tu personaje no está atrapado por esta trampa." }, { status: 400 });

    await db.transaction(async (tx) => {
      const TxPosition = (tx.orm.public as any).MazeCharacterPosition;
      const TxCharacterItem = (tx.orm.public as any).CharacterItem;

      if (action === "DISARM_MAZE_TRAP") {
        await tx.orm.public.MazeRoom.where({ id: Number(room.id) }).update({
          trapActive: false,
          status: "CLEARED",
        });
      }

      await TxPosition.where({ id: Number(position.id) }).update({
        status: "ACTIVE",
        lockReason: null,
      });

      if (quantity === 1) {
        await TxCharacterItem.where({ id: characterItemId }).delete();
      } else {
        await TxCharacterItem.where({ id: characterItemId }).update({ quantity: quantity - 1 });
      }
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_USE_SYSTEM",
      entityType: "ITEM",
      entityId: Number(item.id),
      characterId,
      details: {
        characterItemId,
        itemName: item.name,
        action,
        mazeId: Number(position.mazeId),
        roomId: Number(room.id),
      },
    });

    return NextResponse.json({
      success: true,
      action,
      consumed: 1,
      mazeId: Number(position.mazeId),
      roomId: Number(room.id),
      trapDisabled: action === "DISARM_MAZE_TRAP",
    });
  }

  if (action === "ESCAPE_MAZE") {
    const Position = (db.orm.public as any).MazeCharacterPosition;
    const position = await Position.where({ characterId }).first();
    if (!position) return NextResponse.json({ error: "No estás dentro de un laberinto." }, { status: 400 });

    const root = await db.orm.public.MazeRoom.where({
      mazeId: Number(position.mazeId),
      roomNumber: 1,
    }).first();
    if (!root) return NextResponse.json({ error: "El laberinto no tiene habitación inicial." }, { status: 500 });

    await db.transaction(async (tx) => {
      const TxPosition = (tx.orm.public as any).MazeCharacterPosition;
      const TxCharacterItem = (tx.orm.public as any).CharacterItem;
      await TxPosition.where({ id: Number(position.id) }).update({
        roomId: Number(root.id),
        previousRoomId: null,
        status: "ACTIVE",
        lockReason: null,
      });
      if (quantity === 1) {
        await TxCharacterItem.where({ id: characterItemId }).delete();
      } else {
        await TxCharacterItem.where({ id: characterItemId }).update({ quantity: quantity - 1 });
      }
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_USE_SYSTEM",
      entityType: "ITEM",
      entityId: Number(item.id),
      characterId,
      details: {
        characterItemId,
        itemName: item.name,
        action,
        mazeId: Number(position.mazeId),
        destinationRoomId: Number(root.id),
      },
    });

    return NextResponse.json({
      success: true,
      action,
      consumed: 1,
      mazeId: Number(position.mazeId),
      roomId: Number(root.id),
    });
  }

  return NextResponse.json({ error: "Acción del sistema no implementada." }, { status: 400 });
}
