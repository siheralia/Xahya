import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyDerivedItemEffects, calculateDerivedStats } from "@/lib/stats/derived";
import { getCombatEffects } from "@/lib/combat/effects";
import { getPerkEffects, awardCreationPerks } from "@/lib/perks";
import { recordAuditEvent } from "@/lib/audit";

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

  const CharacterPerk = (db.orm.public as any).CharacterPerk;
  const Perk = (db.orm.public as any).Perk;
  const characterPerks = CharacterPerk ? await CharacterPerk.where({ characterId }).all() : [];
  const perkDefinitions = Perk ? await Perk.all() : [];
  const perks = characterPerks.map((entry:any) => ({
    id: Number(entry.id),
    perkId: Number(entry.perkId),
    source: String(entry.source),
    createdAt: entry.createdAt,
    perk: perkDefinitions.find((perk:any) => Number(perk.id) === Number(entry.perkId)) ?? null,
  }));
  const perkEffects = getPerkEffects(perks);

  const allModifiers = await db.orm.public.CharacterModifier.where({ characterId }).all();
  const now = Date.now();
  const modifiers = allModifiers.filter((modifier) => {
    if (!modifier.expiresAt) return true;
    return new Date(String(modifier.expiresAt)).getTime() > now;
  });

  type StatKey = "strength" | "agility" | "constitution" | "intelligence" | "wisdom" | "charisma" | "spirit" | "luck";
  const perkBaseStatCode: Record<StatKey,string> = { strength:"STR", agility:"AGI", constitution:"CON", intelligence:"INT", wisdom:"WIS", charisma:"CHA", spirit:"SPI", luck:"LCK" };
  const derivedStatCode: Record<string,string> = {
    maxHp:"HP", maxMana:"MANA", physicalAttack:"PHYS_ATK", magicAttack:"MAGIC_ATK", physicalDefense:"DEF", magicDefense:"MAG_DEF",
    precision:"PRECISION", critical:"CRITICAL", discovery:"DISCOVERY", miracle:"MIRACLE", intimidation:"INTIMIDATION",
    conquest:"CONQUEST", race:"RACE", dodge:"DODGE", stealth:"STEALTH", detection:"DETECTION",
  };

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

  const CharacterItem = (db.orm.public as any).CharacterItem;
  const ownedItems = CharacterItem
    ? await CharacterItem.where({ characterId }).all()
    : [];
  const Item = (db.orm.public as any).Item;
  const itemDefinitions = Item ? await Item.all() : [];

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
        const itemStatCode: Record<StatKey, string> = {
          strength: "STR",
          agility: "AGI",
          constitution: "CON",
          intelligence: "INT",
          wisdom: "WIS",
          charisma: "CHA",
          spirit: "SPI",
          luck: "LCK",
        };
        const itemStat = itemStatCode[statKey];
        const itemStatBonuses = equippedItemEffects.filter((effect: any) => effect.type === "stat_bonus" && effect.stat === itemStat).reduce((sum: number, effect: any) => sum + Number(effect.value), 0);
        const itemStatMultipliers = equippedItemEffects.filter((effect: any) => effect.type === "stat_multiplier" && effect.stat === itemStat).reduce((sum: number, effect: any) => sum + Number(effect.value) / 100, 0);
        const perkStatBonuses = perkEffects.filter((effect:any) => String(effect.type)==="STAT_BONUS" && String(effect.target)===itemStat).reduce((sum:number,effect:any)=>sum+Number(effect.value),0);
        const perkStatMultipliers = perkEffects.filter((effect:any) => String(effect.type)==="STAT_MULTIPLIER" && String(effect.target)===itemStat).reduce((sum:number,effect:any)=>sum+Number(effect.value)/100,0);
        const objectFlatBonus = flatModifiers.filter((modifier) => String(modifier.source).startsWith("ITEM:")).reduce((sum, modifier) => sum + Number(modifier.amount), 0) + itemStatBonuses + perkStatBonuses;
        const karmaBonus = flatModifiers.filter((modifier) => String(modifier.source) === "KARMA_BOOST").reduce((sum, modifier) => sum + Number(modifier.amount), 0);
        const combinedMultiplier = 1 + multiplierModifiers.reduce((sum, modifier) => sum + Number(modifier.amount) / 100, 0) + itemStatMultipliers + perkStatMultipliers;
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

  const derivedItemEffects = equippedItemEffects.filter((effect: any) => effect.type === "stat_bonus" || effect.type === "stat_multiplier");
  let derivedStats = effectiveStats ? calculateDerivedStats(effectiveStats) : null;
  if (derivedStats) {
    derivedStats = applyDerivedItemEffects(derivedStats, derivedItemEffects);
  }
  if (derivedStats) {
    for (const effect of perkEffects) {
      const type = String(effect.type);
      const target = String(effect.target ?? "");
      const value = Number(effect.value ?? 0);
      if (type === "RESOURCE_BONUS" && target === "HP") derivedStats.maxHp += value;
      if (type === "RESOURCE_BONUS" && target === "MANA") derivedStats.maxMana += value;
      if (type === "STAT_BONUS" || type === "STAT_MULTIPLIER") {
        const key = Object.keys(derivedStatCode).find((candidate) => derivedStatCode[candidate] === target);
        if (key) {
          if (type === "STAT_BONUS") (derivedStats as any)[key] += value;
          else (derivedStats as any)[key] *= 1 + value / 100;
        }
      }
    }
  }
  const itemEffects = ownedItems
    .filter((owned: any) => Boolean(owned.equipped))
    .flatMap((owned: any) => {
      const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
      const effects = Array.isArray(item?.effects) ? item.effects : [];
      return effects.flatMap((effect: any) => {
        const type = String(effect.type);
        const stat = String(effect.stat ?? "");
        if (type === "stat_multiplier" && stat === "ATTACK_TOTAL") return [{ type: "attack_multiplier_all", value: Number(effect.value), source: "ITEM:" + String(item.name), expiresAt: null }];
        if (type === "stat_bonus" && stat === "DAMAGE_REDUCTION_ALL") return [{ type: "damage_reduction_all", value: Number(effect.value), source: "ITEM:" + String(item.name), expiresAt: null }];
        if (type === "attack_multiplier_all" || type === "damage_reduction_all") return [{ type, value: Number(effect.value), source: "ITEM:" + String(item.name), expiresAt: null }];
        return [];
      });
    });

  const newItemCombatTypes = ["ignore_phys_def_multiplier","ignore_phys_def_bonus","ignore_magic_def_multiplier","ignore_magic_def_bonus","ignore_all_def_multiplier","ignore_all_def_bonus","final_damage_multiplier","final_damage_bonus"];
  const perkCombatEffects = perkEffects.flatMap((effect:any) => {
    const type = String(effect.type ?? "");
    if (type === "COMBAT_MULTIPLIER" && String(effect.target) === "ATTACK_TOTAL") return [{ type: "attack_multiplier_all", value: Number(effect.value), source: String(effect.source ?? "PERK"), expiresAt: null }];
    if (type === "COMBAT_MULTIPLIER" && String(effect.target) === "DAMAGE_REDUCTION_ALL") return [{ type: "damage_reduction_all", value: Number(effect.value), source: String(effect.source ?? "PERK"), expiresAt: null }];
    if (newItemCombatTypes.includes(type)) return [{ type, value: Number(effect.value), source: String(effect.source ?? "PERK"), expiresAt: null }];
    return [];
  });

  const combatEffects = [
    ...getCombatEffects(modifiers),
    ...itemEffects,
    ...perkCombatEffects,
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

  const MazePosition = (db.orm.public as any).MazeCharacterPosition;
  const Maze = (db.orm.public as any).Maze;
  const mazePosition = MazePosition ? await MazePosition.where({ characterId }).first() : null;
  const currentMaze = mazePosition && Maze ? await Maze.where({ id: Number(mazePosition.mazeId) }).first() : null;
  const mazeRoom = mazePosition ? await (db.orm.public as any).MazeRoom.where({ id: Number(mazePosition.roomId) }).first() : null;

  let avatarUrl: string | null = null;
  const avatarPath = (character as any).avatarPath ? String((character as any).avatarPath) : null;
  if (avatarPath && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const signedResponse = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/sign/character-avatars/" + avatarPath, {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
      cache: "no-store",
    });
    if (signedResponse.ok) {
      const signed = await signedResponse.json();
      avatarUrl = signed.signedURL ? process.env.SUPABASE_URL + "/storage/v1" + signed.signedURL : null;
    }
  }

  const normalizedCharacter = { ...character, avatarUrl, themePalette: (character as any).themePalette ?? null, gender: character.gender == null ? null : String(character.gender).trim().toLowerCase() };

  return NextResponse.json({
    ...normalizedCharacter,
    stats,
    resources,
    modifiers,
    perks,
    perkEffects,
    combatEffects,
    equipment,
    effectiveStats,
    statBreakdown,
    derivedStats,
    canSeeCharacterId: user.role === "ADMIN",
    isAdmin: String(user.role) === "ADMIN",
    canManageCharacter: isManagementUser,
    canLevelUp: isOwner && Number(resources?.levelUpPoints ?? 0) > 0,
    maze: currentMaze ? {
      id: Number(currentMaze.id),
      name: String(currentMaze.name),
      roomId: Number(mazePosition.roomId),
      roomNumber: mazeRoom ? Number(mazeRoom.roomNumber) : null,
    } : null,
  });
}


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });

  const isManagementUser = ["GM", "ADMIN"].includes(String(user.role));
  const isOwner = Number(character.userId) === Number(user.id);
  if (!isOwner && !isManagementUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.transaction(async (tx) => awardCreationPerks(tx, characterId));

  if (!result.awardedPerks.length) {
    const currentCount = result.existingCount;
    return NextResponse.json(
      { error: currentCount >= 3 ? "El personaje ya tiene sus 3 perks." : "No hay una perk válida disponible para completar la creación.", count: currentCount },
      { status: 400 },
    );
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: "CHARACTER_CREATION_PERKS_RESTORED",
    entityType: "CHARACTER",
    entityId: characterId,
    characterId,
    details: {
      restoredPerks: result.awardedPerks.map((entry: any) => Number(entry.perkId)),
      previousCount: result.existingCount,
      finalCount: result.existingCount + result.awardedPerks.length,
    },
  });

  return NextResponse.json({
    success: true,
    count: result.existingCount + result.awardedPerks.length,
    awardedPerks: result.awardedPerks.map((entry: any) => ({
      id: Number(entry.id),
      perkId: Number(entry.perkId),
      source: String(entry.source),
    })),
  });
}
