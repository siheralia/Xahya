import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });

  const characterId = Number((await params).id);
  const Character = db.orm.public.Character;
  const character = await Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const privileged = ["GM", "ADMIN"].includes(String(user.role));
  if (!privileged && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const Relationship = (db.orm.public as any).CharacterRelationship;
  const rows = await Relationship.where({ characterId }).all();
  const ids = rows.map((row: any) => Number(row.knownCharacterId));
  const all = await Character.all();
  const known = all.filter((candidate: any) => ids.includes(Number(candidate.id))).map((candidate: any) => ({ id: Number(candidate.id), name: candidate.name }));
  return NextResponse.json({ characters: known, canTransferToAny: privileged });
}
