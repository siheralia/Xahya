import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateDerivedStats } from "@/lib/stats/derived";
import { getCombatEffects } from "@/lib/combat/effects";

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

  const allModifiers = await db.orm.public.CharacterModifier.where({ characterId }).all();
  const now = Date.now();
  const modifiers = allModifiers.filter((modifier) => {
    if (!modifier.expiresAt) return true;
    return new Date(String(modifier.expiresAt)).getTime() > now;
  });

  type StatKey = "strength" | "agility" | "constitution" | "intelligence" | "wisdom" | "charisma" | "spirit" | "luck";

  const baseStats = stats
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

  const statBreakdown = baseStats
    ? (Object.keys(baseStats) as StatKey[]).reduce((result, statKey) => {
        const base = baseStats[statKey];
        const flatModifiers = modifiers.filter((modifier) => String(modifier.stat) === statKey);
        const multiplierModifiers = modifiers.filter((modifier) => String(modifier.stat) === statKey + "_multiplier");
        const objectFlatBonus = flatModifiers.filter((modifier) => String(modifier.source).startsWith("ITEM:")).reduce((sum, modifier) => sum + Number(modifier.amount), 0);
        const karmaBonus = flatModifiers.filter((modifier) => String(modifier.source) === "KARMA_BOOST").reduce((sum, modifier) => sum + Number(modifier.amount), 0);
        const combinedMultiplier = 1 + multiplierModifiers.reduce((sum, modifier) => sum + Number(modifier.amount) / 100, 0);
        result[statKey] = {
          base,
          multipliers: multiplierModifiers.map((modifier) => 1 + Number(modifier.amount) / 100),
          combinedMultiplier,
          objectFlatBonus,
          karmaBonus,
          value: base * combinedMultiplier + objectFlatBonus + karmaBonus,
        };
        return result;
      }, {} as Record<StatKey, { base: number; multipliers: number[]; combinedMultiplier: number; objectFlatBonus: number; karmaBonus: number; value: number }>)
    : null;

  const effectiveStats = statBreakdown
    ? (Object.keys(statBreakdown) as StatKey[]).reduce((result, statKey) => {
        result[statKey] = statBreakdown[statKey].value;
        return result;
      }, {} as Record<StatKey, number>)
    : null;

  const derivedStats = effectiveStats ? calculateDerivedStats(effectiveStats) : null;
  const combatEffects = getCombatEffects(modifiers);

  const normalizedCharacter = { ...character, gender: character.gender == null ? null : String(character.gender).trim().toLowerCase() };

  return NextResponse.json({
    ...normalizedCharacter,
    stats,
    resources,
    modifiers,
    combatEffects,
    effectiveStats,
    derivedStats,
    canSeeCharacterId: user.role === "ADMIN",
    canManageCharacter: isManagementUser,
    canLevelUp: isOwner && Number(resources?.levelUpPoints ?? 0) > 0,
  });
}
