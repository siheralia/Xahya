import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((user) => user.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function GET(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const characterId = Number(new URL(request.url).searchParams.get("characterId"));
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  const Character = db.orm.public.Character;
  const character = await Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  try {
    const Relationship = (db.orm.public as any).CharacterRelationship;
    const rows = await Relationship.where({ characterId }).all();
    return NextResponse.json({ knownCharacterIds: rows.map((row: any) => Number(row.knownCharacterId)) });
  } catch (error) {
    console.error("SOCIAL_GET_FAILED", error);
    return NextResponse.json({ error: "No se pudieron cargar las relaciones." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const characterId = Number(body?.characterId);
  const knownCharacterIds: number[] = Array.isArray(body?.knownCharacterIds)
    ? Array.from(new Set<number>(
        body.knownCharacterIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0),
      ))
    : [];
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  if (knownCharacterIds.includes(characterId)) return NextResponse.json({ error: "Un personaje no puede conocerse a sí mismo." }, { status: 400 });

  try {
    const Character = db.orm.public.Character;
    const allCharacters = await Character.all();
    const validIds = new Set(allCharacters.map((character: any) => Number(character.id)));
    if (knownCharacterIds.some((id) => !validIds.has(id))) return NextResponse.json({ error: "Hay personajes inválidos en la relación." }, { status: 400 });

    const Relationship = (db.orm.public as any).CharacterRelationship;
    const current = await Relationship.where({ characterId }).all();
    const wanted = new Set(knownCharacterIds);
    for (const row of current) {
      if (!wanted.has(Number(row.knownCharacterId))) await Relationship.where({ id: Number(row.id) }).delete();
    }
    const existing = new Set(current.map((row: any) => Number(row.knownCharacterId)));
    for (const knownCharacterId of knownCharacterIds) {
      if (!existing.has(knownCharacterId)) await Relationship.create({ characterId, knownCharacterId });
    }

    await recordAuditEvent({
      actorUserId: Number(manager.id),
      action: "SOCIAL_RELATIONSHIPS_UPDATE",
      entityType: "CHARACTER",
      entityId: characterId,
      characterId,
      details: { knownCharacterIds },
    });
    return NextResponse.json({ knownCharacterIds });
  } catch (error) {
    console.error("SOCIAL_PUT_FAILED", error);
    return NextResponse.json({ error: "No se pudieron guardar las relaciones." }, { status: 500 });
  }
}
