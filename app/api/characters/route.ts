import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return null;
  }

  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characters = await db.orm.public.Character.all();
  const stats = await db.orm.public.CharacterStat.all();

  const charactersWithStats = characters.map((character) => ({
    ...character,
    stats: stats.find((stat) => Number(stat.characterId) === Number(character.id)) ?? null,
  }));

  if (["GM", "ADMIN"].includes(String(user.role))) {
    return NextResponse.json(charactersWithStats);
  }

  return NextResponse.json(
    charactersWithStats.filter((character) => Number(character.userId) === Number(user.id))
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (String(user.role) === "PLAYER") {
    const userCharacters = (await db.orm.public.Character.all()).filter(
      (character) => Number(character.userId) === Number(user.id)
    );

    if (userCharacters.length >= 3) {
      return NextResponse.json(
        { error: "Cada usuario puede tener un máximo de 3 personajes." },
        { status: 400 }
      );
    }
  }

  const body = await request.json();

  const character = await db.transaction(async (tx) => {
    const character = await tx.orm.public.Character.create({
      name: body.name,
      userId: user.id,
    });

    await tx.orm.public.CharacterStat.create({
      characterId: character.id,
      strength: body.stats?.strength ?? 0,
      agility: body.stats?.agility ?? 0,
      constitution: body.stats?.constitution ?? 0,
      intelligence: body.stats?.intelligence ?? 0,
      wisdom: body.stats?.wisdom ?? 0,
      charisma: body.stats?.charisma ?? 0,
      spirit: body.stats?.spirit ?? 0,
      luck: body.stats?.luck ?? 0,
    });

    await tx.orm.public.CharacterResource.create({
      characterId: character.id,
    });

    return character;
  });

  return NextResponse.json(character, { status: 201 });
}
