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

  const equippedItemEffects = ownedItems
    .filter((owned: any) => Boolean(owned.equipped))
    .flatMap((owned: any) => {
      const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
      const effects = Array.isArray(item?.effects) ? item.effects : [];
      return effects.map((effect: any) => ({
        type: String(effect.type), stat: String(effect.stat ?? ""), value: Number(effect.value), source: "ITEM:" + String(item.name),
      }));
    });

  const statBreakdown = baseStats
    ? (Object.keys(baseStats) as StatKey[]).reduce((result, statKey) => {
        const base = baseStats[statKey];
        const flatModifiers = modifiers.filter((modifier) => String(modifier.stat) === statKey);
        const multiplierModifiers = modifiers.filter((modifier) => String(modifier.stat) === statKey + "_multiplier");
        const itemStatBonuses = equippedItemEffects.filter((effect: any) => effect.type === "stat_bonus" && effect.stat === statKey).reduce((sum: number, effect: any) => sum + Number(effect.value), 0);
        const itemStatMultipliers = equippedItemEffects.filter((effect: any) => effect.type === "stat_multiplier" && effect.stat === statKey).reduce((sum: number, effect: any) => sum + Number(effect.value) / 100, 0);
        const objectFlatBonus = flatModifiers.filter((modifier) => String(modifier.source).startsWith("ITEM:")).reduce((sum, modifier) => sum + Number(modifier.amount), 0) + itemStatBonuses;
        const karmaBonus = flatModifiers.filter((modifier) => String(modifier.source) === "KARMA_BOOST").reduce((sum, modifier) => sum + Number(modifier.amount), 0);
        const combinedMultiplier = 1 + multiplierModifiers.reduce((sum, modifier) => sum + Number(modifier.amount) / 100, 0) + itemStatMultipliers;
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
  const CharacterItem = (db.orm.public as any).CharacterItem;
  const ownedItems = CharacterItem
    ? await CharacterItem.where({ characterId }).all()
    : [];
  const Item = (db.orm.public as any).Item;
  const itemDefinitions = Item ? await Item.all() : [];
  const itemEffects = ownedItems
    .filter((owned: any) => Boolean(owned.equipped))
    .flatMap((owned: any) => {
      const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
      const effects = Array.isArray(item?.effects) ? item.effects : [];
      return effects.map((effect: any) => ({
        type: String(effect.type),
        value: Number(effect.value),
        source: "ITEM:" + String(item.name),
        expiresAt: null,
      }));
    });

  const combatEffects = [
    ...getCombatEffects(modifiers),
    ...itemEffects,
  ];

  const equipment = ownedItems.map((owned: any) => {
    const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
    return {
      id: Number(owned.id),
      itemId: Number(owned.itemId),
      quantity: Number(owned.quantity),
      equipped: Boolean(owned.equipped),
      equippedSlot: owned.equippedSlot == null ? null : String(owned.equippedSlot),
      flair: owned.flair == null ? null : String(owned.flair),
      item: item ?? null,
    };
  });

  const normalizedCharacter = { ...character, gender: character.gender == null ? null : String(character.gender).trim().toLowerCase() };

  return NextResponse.json({
    ...normalizedCharacter,
    stats,
    resources,
    modifiers,
    combatEffects,
    equipment,
    effectiveStats,
    derivedStats,
    canSeeCharacterId: user.role === "ADMIN",
    canManageCharacter: isManagementUser,
    canLevelUp: isOwner && Number(resources?.levelUpPoints ?? 0) > 0,
  });
}
