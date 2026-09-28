import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const characters = await db.orm.public.Character.all();

  return NextResponse.json(characters);
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);

  if (!user) {
    return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });
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