import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const statNames = [
  "strength", "agility", "constitution", "intelligence",
  "wisdom", "charisma", "spirit", "luck",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  if (Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const stat = body?.stat;
  if (!statNames.includes(stat)) {
    return NextResponse.json({ error: "Estadística inválida." }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const resources = await tx.orm.public.CharacterResource.where({ characterId }).first();
    if (!resources) throw new Error("RESOURCE_NOT_FOUND");

    const karma = Number(resources.karma);
    if (karma < 20) throw new Error("NOT_ENOUGH_KARMA");

    const updatedResources = await tx.orm.public.CharacterResource
      .where({ id: resources.id })
      .update({ karma: karma - 20 });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const modifier = await tx.orm.public.CharacterModifier.create({
      characterId,
      stat,
      amount: 20,
      source: "KARMA_BOOST",
      expiresAt,
    });

    return { updatedResources, modifier };
  }).catch((error) => {
    if (error instanceof Error && error.message === "NOT_ENOUGH_KARMA") {
      return { error: "Necesitas 20 de karma para realizar este boost." };
    }
    throw error;
  });

  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ karma: Number(result.updatedResources.karma), modifier: result.modifier });
}
