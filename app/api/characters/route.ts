import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { pickWeightedPerk } from "@/lib/perks";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allCharacters = await db.orm.public.Character.all();
  const visibleCharacters = ["GM","ADMIN"].includes(String(user.role))
    ? allCharacters
    : allCharacters.filter((character) => Number(character.userId) === Number(user.id));
  const stats = await db.orm.public.CharacterStat.all();
  const resources = await db.orm.public.CharacterResource.all();

  return NextResponse.json(visibleCharacters.map((character) => ({
    id: character.id, name: character.name, flair: character.flair ?? null, userId: character.userId, createdAt: character.createdAt,
    stats: stats.find((stat) => Number(stat.characterId) === Number(character.id)) ?? null,
    levelUpPoints: resources.find((resource) => Number(resource.characterId) === Number(character.id))?.levelUpPoints ?? 0,
    money: resources.find((resource) => Number(resource.characterId) === Number(character.id))?.money ?? 0,
  })));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (String(user.role) === "PLAYER") {
    const userCharacters = (await db.orm.public.Character.all()).filter((character) => Number(character.userId) === Number(user.id));
    if (userCharacters.length >= 3) return NextResponse.json({ error: "Cada usuario puede tener un máximo de 3 personajes." }, { status: 400 });
  }

  const body = await request.json();
  const flair = typeof body.flair === "string" ? body.flair.trim() : "";
  const flairCount = flair ? Array.from(new Intl.Segmenter("es", { granularity: "grapheme" }).segment(flair)).length : 0;
  if (flairCount > 2) {
    return NextResponse.json({ error: "El flair puede contener como máximo 2 emojis." }, { status: 400 });
  }
  const character = await db.transaction(async (tx) => {
    const character = await tx.orm.public.Character.create({ name: body.name, flair: flair || null, userId: user.id });
    await tx.orm.public.CharacterStat.create({
      characterId: character.id, strength: body.stats?.strength ?? 0, agility: body.stats?.agility ?? 0,
      constitution: body.stats?.constitution ?? 0, intelligence: body.stats?.intelligence ?? 0, wisdom: body.stats?.wisdom ?? 0,
      charisma: body.stats?.charisma ?? 0, spirit: body.stats?.spirit ?? 0, luck: body.stats?.luck ?? 0,
    });
    await tx.orm.public.CharacterResource.create({ characterId: character.id, karma: 1, money: 1000 });

    const Perk = (tx.orm.public as any).Perk;
    const CharacterPerk = (tx.orm.public as any).CharacterPerk;
    const awardedPerks: any[] = [];
    if (Perk && CharacterPerk) {
      const availablePerks = await Perk.where({ active: true }).all();
      for (let roll = 0; roll < 3; roll += 1) {
        const selected = pickWeightedPerk(availablePerks);
        if (!selected) continue;
        const existingCount = awardedPerks.filter((entry) => Number(entry.perkId) === Number(selected.id)).length;
        if (!Boolean(selected.stackable) && Number(selected.maxStacks ?? 1) <= existingCount) continue;
        const awarded = await CharacterPerk.create({
          characterId: character.id,
          perkId: selected.id,
          source: "CREATION_ROLL",
        });
        awardedPerks.push(awarded);
      }

      const resourceBonuses = awardedPerks
        .map((entry) => availablePerks.find((perk:any) => Number(perk.id) === Number(entry.perkId)))
        .flatMap((perk:any) => Array.isArray(perk?.effects) ? perk.effects : [])
        .filter((effect:any) => String(effect.type) === "RESOURCE_BONUS")
        .reduce((totals:any, effect:any) => {
          const target = String(effect.target ?? "");
          const value = Number(effect.value ?? 0);
          if (target === "KARMA") totals.karma += value;
          if (target === "MONEY") totals.money += value;
          if (target === "LEVEL_UP_POINTS") totals.levelUpPoints += value;
          return totals;
        }, { karma: 0, money: 0, levelUpPoints: 0 });

      if (resourceBonuses.karma || resourceBonuses.money || resourceBonuses.levelUpPoints) {
        await tx.orm.public.CharacterResource.where({ characterId: character.id }).update({
          karma: 1 + resourceBonuses.karma,
          money: 1000 + resourceBonuses.money,
          levelUpPoints: resourceBonuses.levelUpPoints,
        });
      }
    }
    return { character, awardedPerks };

  });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "CHARACTER_CREATED",
    entityType: "CHARACTER",
    entityId: character.character.id,
    characterId: character.character.id,
    details: {
      name: character.character.name,
      initialKarma: 1,
      initialMoney: 1000,
      creationPerks: (character.awardedPerks ?? []).map((entry: any) => Number(entry.perkId)),
    },
  });

  return NextResponse.json({ ...character.character, perks: character.awardedPerks ?? [] }, { status: 201 });
}
