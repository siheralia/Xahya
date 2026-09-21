import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characterId = Number(id);
  const body = await request.json();

  const statNames = [
  "strength",
  "agility",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "spirit",
  "luck",
];

for (const stat of statNames) {
  if (typeof body[stat] !== "number" || !Number.isFinite(body[stat])) {
    return NextResponse.json(
      { error: `El stat ${stat} debe ser un número válido` },
      { status: 400 }
    );
  }
}

  const stats = await db.orm.public.CharacterStat
    .where({ characterId })
    .first();

  if (!stats) {
    return NextResponse.json(
      { error: "Stats del personaje no encontrados" },
      { status: 404 }
    );
  }

  const updatedStats = await db.orm.public.CharacterStat
  .where({ id: stats.id })
  .update({
    strength: body.strength,
    agility: body.agility,
    constitution: body.constitution,
    intelligence: body.intelligence,
    wisdom: body.wisdom,
    charisma: body.charisma,
    spirit: body.spirit,
    luck: body.luck,
  });

  return NextResponse.json(updatedStats);
}