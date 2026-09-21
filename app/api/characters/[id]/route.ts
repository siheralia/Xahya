import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateDerivedStats } from "@/lib/stats/derived";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characterId = Number(id);

  const character = await db.orm.public.Character
  .where({ id: characterId })
  .first();

  if (!character) {
    return NextResponse.json(
      { error: "Personaje no encontrado" },
      { status: 404 }
    );
  }

  const stats = await db.orm.public.CharacterStat
  .where({ characterId })
  .first();

  const resources = await db.orm.public.CharacterResource
  .where({ characterId })
  .first();

 const derivedStats = stats
  ? calculateDerivedStats({
      strength: Number(stats.strength),
      agility: Number(stats.agility),
      constitution: Number(stats.constitution),
      intelligence: Number(stats.intelligence),
      wisdom: Number(stats.wisdom),
      charisma: Number(stats.charisma),
      spirit: Number(stats.spirit),
      luck: Number(stats.luck),
    })
  : null;

  return NextResponse.json({
    ...character,
    stats,
    resources,
    derivedStats,
  });
}