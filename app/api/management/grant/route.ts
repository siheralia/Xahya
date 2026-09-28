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

  if (!currentUser || !["GM", "ADMIN"].includes(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
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

  const stats = body.stats ?? {};

  for (const stat of statNames) {
    if (stats[stat] !== undefined && !isValidInteger(stats[stat])) {
      return NextResponse.json(
        { error: `El stat ${stat} debe ser un entero válido` },
        { status: 400 },
      );
    }
  }

  const karma = body.karma ?? 0;
  const money = body.money ?? 0;

  if (!isValidInteger(karma) || !isValidInteger(money)) {
    return NextResponse.json(
      { error: "Karma y dinero deben ser enteros válidos" },
      { status: 400 },
    );
  }

  const hasChanges =
    statNames.some((stat) => (stats[stat] ?? 0) !== 0) ||
    karma !== 0 ||
    money !== 0;

  if (!hasChanges) {
    return NextResponse.json(
      { error: "No hay cambios para aplicar" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const currentStats = await tx.orm.public.CharacterStat
      .where({ characterId })
      .first();

    const currentResources = await tx.orm.public.CharacterResource
      .where({ characterId })
      .first();

    if (!currentStats || !currentResources) {
      throw new Error("Datos del personaje incompletos");
    }

    const updatedStats = await tx.orm.public.CharacterStat
      .where({ id: currentStats.id })
      .update(
        Object.fromEntries(
          statNames.map((stat) => [
            stat,
            Number(currentStats[stat]) + (stats[stat] ?? 0),
          ]),
        ) as Record<StatName, number>,
      );

    const updatedResources = await tx.orm.public.CharacterResource
      .where({ id: currentResources.id })
      .update({
        karma: Number(currentResources.karma) + karma,
        money: Number(currentResources.money) + money,
      });

    return { updatedStats, updatedResources };
  });

  return NextResponse.json(result);
}
