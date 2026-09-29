import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allCharacters = await db.orm.public.Character.all();
  const visibleCharacters = ["GM","ADMIN"].includes(String(user.role))
    ? allCharacters
    : allCharacters.filter((character) => Number(character.userId) === Number(user.id));
  const stats = await db.orm.public.CharacterStat.all();
  const resources = await db.orm.public.CharacterResource.all();

  return NextResponse.json(visibleCharacters.map((character) => ({
    id: character.id, name: character.name, userId: character.userId, createdAt: character.createdAt,
    stats: stats.find((stat) => Number(stat.characterId) === Number(character.id)) ?? null,
    levelUpPoints: resources.find((resource) => Number(resource.characterId) === Number(character.id))?.levelUpPoints ?? 0,
    money: resources.find((resource) => Number(resource.characterId) === Number(character.id))?.money ?? 0,
  })));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (String(user.role) === "PLAYER") {
    const userCharacters = (await db.orm.public.Character.all()).filter((character) => Number(character.userId) === Number(user.id));
    if (userCharacters.length >= 3) return NextResponse.json({ error: "Cada usuario puede tener un máximo de 3 personajes." }, { status: 400 });
  }

  const body = await request.json();
  const character = await db.transaction(async (tx) => {
    const character = await tx.orm.public.Character.create({ name: body.name, userId: user.id });
    await tx.orm.public.CharacterStat.create({
      characterId: character.id, strength: body.stats?.strength ?? 0, agility: body.stats?.agility ?? 0,
      constitution: body.stats?.constitution ?? 0, intelligence: body.stats?.intelligence ?? 0, wisdom: body.stats?.wisdom ?? 0,
      charisma: body.stats?.charisma ?? 0, spirit: body.stats?.spirit ?? 0, luck: body.stats?.luck ?? 0,
    });
    await tx.orm.public.CharacterResource.create({ characterId: character.id, karma: 1, money: 1000 });
    return character;
  });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "CHARACTER_CREATED",
    entityType: "CHARACTER",
    entityId: character.id,
    characterId: character.id,
    details: { name: character.name, initialKarma: 1, initialMoney: 1000 },
  });

  return NextResponse.json(character, { status: 201 });
}
