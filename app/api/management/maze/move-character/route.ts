import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const users = await db.orm.public.User.all();
  const user = users.find((entry: any) => entry.clerkId === clerkId);
  if (!user || String(user.role) !== "ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN puede trasladar personajes." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const mazeId = Number(body?.mazeId);
  const characterId = Number(body?.characterId);
  const roomId = Number(body?.roomId);
  if (![mazeId, characterId, roomId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return NextResponse.json({ error: "Laberinto, personaje y habitación son obligatorios." }, { status: 400 });
  }

  const maze = await db.orm.public.Maze.where({ id: mazeId }).first();
  if (!maze) return NextResponse.json({ error: "Laberinto no encontrado." }, { status: 404 });
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  const destination = await db.orm.public.MazeRoom.where({ id: roomId, mazeId }).first();
  if (!destination) return NextResponse.json({ error: "La habitación no pertenece a este laberinto." }, { status: 400 });

  const Position = (db.orm.public as any).MazeCharacterPosition;
  const current = await Position.where({ mazeId, characterId }).first();
  const values = {
    mazeId,
    characterId,
    roomId,
    previousRoomId: current ? Number(current.roomId) : null,
    status: "ACTIVE",
    lockReason: null,
  };
  if (current) {
    await Position.where({ id: Number(current.id) }).update(values);
  } else {
    await Position.create(values);
  }

  await recordAuditEvent({
    actorUserId: Number(user.id),
    action: "MAZE_ADMIN_TELEPORT",
    entityType: "MAZE_CHARACTER_POSITION",
    entityId: Number(current?.id ?? characterId),
    characterId,
    details: { mazeId, fromRoomId: current ? Number(current.roomId) : null, toRoomId: roomId },
  });

  return NextResponse.json({
    success: true,
    character: String(character.name),
    roomNumber: Number(destination.roomNumber),
    previousRoomId: current ? Number(current.roomId) : null,
  });
}
