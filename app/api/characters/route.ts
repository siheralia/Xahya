import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const characters = await db.orm.public.Character.all();

  return NextResponse.json(characters);
}

export async function POST(request: Request) {
  const body = await request.json();

  const character = await db.transaction(async (tx) => {
    const character = await tx.orm.public.Character.create({
      name: body.name,
      userId: body.userId,
    });

    await tx.orm.public.CharacterStat.create({
      characterId: character.id,
    });

    await tx.orm.public.CharacterResource.create({
      characterId: character.id,
    });

    return character;
  });

  return NextResponse.json(character, { status: 201 });
}