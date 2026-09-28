import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateDerivedStats } from "@/lib/stats/derived";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characterId = Number(id);

  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);

  if (!user) {
    return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });
  }

  const character = await db.orm.public.Character
    .where({ id: characterId })
    .first();

  if (!character) {
    return NextResponse.json(
      { error: "Personaje no encontrado" },
      { status: 404 }
    );
  }

  const isManagementUser = ["GM", "ADMIN"].includes(String(user.role));
  const isOwner = Number(character.userId) === Number(user.id);

  if (!isOwner && !isManagementUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await db.orm.public.CharacterStat
    .where({ characterId })
    .first();

  const resources = await db.orm.public.CharacterResource
    .where({ characterId })
    .first();

  const modifiers = await db.orm.public.CharacterModifier.where({ characterId }).all();

  const effectiveStats = stats
    ? {
        strength: Number(stats.strength),
        agility: Number(stats.agility),
        constitution: Number(stats.constitution),
        intelligence: Number(stats.intelligence),
        wisdom: Number(stats.wisdom),
        charisma: Number(stats.charisma),
        spirit: Number(stats.spirit),
        luck: Number(stats.luck),
      }
    : null;

  if (effectiveStats) {
    for (const modifier of modifiers) {
      const stat = String(modifier.stat) as keyof typeof effectiveStats;
      if (stat in effectiveStats) effectiveStats[stat] += Number(modifier.amount);
    }
  }

  const derivedStats = effectiveStats ? calculateDerivedStats(effectiveStats) : null;

  return NextResponse.json({
    ...character,
    stats,
    resources,
    modifiers,
    effectiveStats,
    derivedStats,
    canSeeCharacterId: user.role === "ADMIN",
    canManageCharacter: isManagementUser,
    canLevelUp: isOwner && Number(resources?.levelUpPoints ?? 0) > 0,
  });
}
