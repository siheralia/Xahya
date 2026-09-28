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

async function getContext(id: string) {
  const characterId = Number(id);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return { error: NextResponse.json({ error: "Personaje inválido" }, { status: 400 }) };
  }

  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);

  if (!user) {
    return { error: NextResponse.json({ error: "Xahya user not found" }, { status: 404 }) };
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();

  if (!character) {
    return { error: NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 }) };
  }

  if (Number(character.userId) !== Number(user.id)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { character, characterId, user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await getContext(id);

  if ("error" in context) return context.error;

  const stats = await db.orm.public.CharacterStat
    .where({ characterId: context.characterId })
    .first();

  const resources = await db.orm.public.CharacterResource
    .where({ characterId: context.characterId })
    .first();

  if (!stats || !resources) {
    return NextResponse.json({ error: "Datos del personaje incompletos" }, { status: 500 });
  }

  return NextResponse.json({
    character: {
      id: context.character.id,
      name: context.character.name,
    },
    stats,
    levelUpPoints: Number(resources.levelUpPoints),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await getContext(id);

  if ("error" in context) return context.error;

  const body = await request.json().catch(() => null);
  const requestedStats = body?.stats ?? {};

  for (const stat of statNames) {
    if (!isValidInteger(requestedStats[stat])) {
      return NextResponse.json(
        { error: `El stat ${stat} debe ser un entero válido` },
        { status: 400 },
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    const currentStats = await tx.orm.public.CharacterStat
      .where({ characterId: context.characterId })
      .first();

    const resources = await tx.orm.public.CharacterResource
      .where({ characterId: context.characterId })
      .first();

    if (!currentStats || !resources) {
      throw new Error("Datos del personaje incompletos");
    }

    const currentValues = Object.fromEntries(
      statNames.map((stat) => [stat, Number(currentStats[stat])]),
    ) as Record<StatName, number>;

    const nextValues = Object.fromEntries(
      statNames.map((stat) => [stat, requestedStats[stat]]),
    ) as Record<StatName, number>;

    const spent = statNames.reduce(
      (total, stat) => total + (nextValues[stat] - currentValues[stat]),
      0,
    );

    if (spent < 0) {
      throw new Error("LEVEL_UP_STATS_CANNOT_DECREASE");
    }

    if (spent === 0) {
      throw new Error("LEVEL_UP_NO_CHANGES");
    }

    const availablePoints = Number(resources.levelUpPoints);

    if (spent > availablePoints) {
      throw new Error("LEVEL_UP_NOT_ENOUGH_POINTS");
    }

    const updatedStats = await tx.orm.public.CharacterStat
      .where({ id: currentStats.id })
      .update(nextValues);

    const updatedResources = await tx.orm.public.CharacterResource
      .where({ id: resources.id })
      .update({
        levelUpPoints: availablePoints - spent,
      });

    return { updatedStats, updatedResources, spent };
  }).catch((error) => {
    if (error instanceof Error) {
      if (error.message === "LEVEL_UP_STATS_CANNOT_DECREASE") {
        return { error: "No puedes reducir una estadística por debajo de su valor actual." };
      }
      if (error.message === "LEVEL_UP_NO_CHANGES") {
        return { error: "No hay cambios para aplicar." };
      }
      if (error.message === "LEVEL_UP_NOT_ENOUGH_POINTS") {
        return { error: "No tienes suficientes puntos de Level Up." };
      }
    }
    throw error;
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
