import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const statNames = [
  "strength",
  "agility",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "spirit",
  "luck",
] as const;

type StatName = (typeof statNames)[number];

function isValidInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);
  const role = String(currentUser?.role);

  if (!currentUser || !["GM", "ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allCharacters = body.allCharacters === true;

  if (!allCharacters) {
    const characterId = Number(body.characterId);

    if (!Number.isInteger(characterId) || characterId <= 0) {
      return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
    }

    const character = await db.orm.public.Character
      .where({ id: characterId })
      .first();

    if (!character) {
      return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
    }
  }

  const stats = body.stats ?? {};

  for (const stat of statNames) {
    if (stats[stat] !== undefined && !isValidInteger(stats[stat])) {
      return NextResponse.json(
        { error: `El stat ${stat} debe ser un entero válido` },
        { status: 400 },
      );
    }
  }

  if (allCharacters && statNames.some((stat) => (stats[stat] ?? 0) !== 0)) {
    return NextResponse.json(
      { error: "La entrega global solo puede modificar recursos." },
      { status: 400 },
    );
  }

  if (role === "GM" && statNames.some((stat) => (stats[stat] ?? 0) !== 0)) {
    return NextResponse.json(
      { error: "Los GM no pueden modificar las estadísticas base." },
      { status: 403 },
    );
  }

  const karma = body.karma ?? 0;
  const money = body.money ?? 0;
  const levelUpPoints = body.levelUpPoints ?? 0;

  if (!isValidInteger(karma) || !isValidInteger(money) || !isValidInteger(levelUpPoints)) {
    return NextResponse.json(
      { error: "Karma, dinero y puntos de Level Up deben ser enteros válidos" },
      { status: 400 },
    );
  }

  const hasChanges =
    statNames.some((stat) => (stats[stat] ?? 0) !== 0) ||
    karma !== 0 ||
    money !== 0 ||
    levelUpPoints !== 0;

  if (!hasChanges) {
    return NextResponse.json(
      { error: "No hay cambios para aplicar" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    if (allCharacters) {
      const characters = await tx.orm.public.Character.all();
      const systemUser = (await tx.orm.public.User.where({ role: "SYSTEM" }).first())?.id;
      const targets = characters.filter((character) => Number(character.userId) !== Number(systemUser));

      let updated = 0;
      for (const character of targets) {
        const resources = await tx.orm.public.CharacterResource
          .where({ characterId: character.id })
          .first();

        if (!resources) continue;

        await tx.orm.public.CharacterResource
          .where({ id: resources.id })
          .update({
            karma: Number(resources.karma) + karma,
            money: Number(resources.money) + money,
            levelUpPoints: Number(resources.levelUpPoints) + levelUpPoints,
          });

        updated += 1;
      }

      return { updatedCharacters: updated };
    }

    const characterId = Number(body.characterId);
    const currentStats = await tx.orm.public.CharacterStat
      .where({ characterId })
      .first();

    const currentResources = await tx.orm.public.CharacterResource
      .where({ characterId })
      .first();

    if (!currentStats || !currentResources) {
      throw new Error("Datos del personaje incompletos");
    }

    if (role === "ADMIN") {
      await tx.orm.public.CharacterStat
        .where({ id: currentStats.id })
        .update(
          Object.fromEntries(
            statNames.map((stat) => [
              stat,
              Number(currentStats[stat]) + (stats[stat] ?? 0),
            ]),
          ) as Record<StatName, number>,
        );
    }

    await tx.orm.public.CharacterResource
      .where({ id: currentResources.id })
      .update({
        karma: Number(currentResources.karma) + karma,
        money: Number(currentResources.money) + money,
        levelUpPoints: Number(currentResources.levelUpPoints) + levelUpPoints,
      });

    return { updatedCharacters: 1 };
  });

  return NextResponse.json(result);
}
