import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const users = await db.orm.public.User.all();
  const user = users.find((entry: any) => entry.clerkId === clerkId);
  if (!user || String(user.role) !== "ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN puede consultar todos los personajes." }, { status: 403 });
  }
  const mazeId = Number(new URL(request.url).searchParams.get("mazeId"));
  if (!Number.isSafeInteger(mazeId) || mazeId <= 0) {
    return NextResponse.json({ error: "Laberinto inválido." }, { status: 400 });
  }
  const maze = await db.orm.public.Maze.where({ id: mazeId }).first();
  if (!maze) return NextResponse.json({ error: "Laberinto no encontrado." }, { status: 404 });
  const [characters, positions, rooms] = await Promise.all([
    db.orm.public.Character.all(),
    (db.orm.public as any).MazeCharacterPosition.where({ mazeId }).all(),
    db.orm.public.MazeRoom.where({ mazeId }).all(),
  ]);
  return NextResponse.json(characters.map((character: any) => {
    const position = positions.find((entry: any) => Number(entry.characterId) === Number(character.id));
    const room = position ? rooms.find((entry: any) => Number(entry.id) === Number(position.roomId)) : null;
    return {
      id: Number(character.id),
      name: String(character.name),
      ownerName: users.find((entry: any) => Number(entry.id) === Number(character.userId))?.name ?? null,
      roomId: position ? Number(position.roomId) : null,
      roomNumber: room ? Number(room.roomNumber) : null,
      status: position ? String(position.status ?? "ACTIVE") : null,
    };
  }));
}
