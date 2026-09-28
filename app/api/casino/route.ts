import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const segments = [
  { label: "0", weight: 100, multiplier: -1 },
  { label: "+10%", weight: 80, multiplier: 0.1 },
  { label: "0", weight: 100, multiplier: -1 },
  { label: "+50%", weight: 60, multiplier: 0.5 },
  { label: "0", weight: 100, multiplier: -1 },
  { label: "+100%", weight: 40, multiplier: 1 },
  { label: "0", weight: 20, multiplier: -1 },
  { label: "+150%", weight: 30, multiplier: 1.5 },
  { label: "+200%", weight: 20, multiplier: 2 },
  { label: "+500%", weight: 10, multiplier: 5 },
  { label: "-100%", weight: 1, multiplier: -2 },
  { label: "+1000%", weight: 5, multiplier: 10 },
] as const;

const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characters = await db.orm.public.Character.all();
  const resources = await db.orm.public.CharacterResource.all();

  const owned = characters
    .filter((character) => Number(character.userId) === Number(user.id))
    .map((character) => {
      const resource = resources.find(
        (candidate) => Number(candidate.characterId) === Number(character.id),
      );

      return {
        id: character.id,
        name: character.name,
        money: Number(resource?.money ?? 0),
        karma: Number(resource?.karma ?? 0),
      };
    });

  return NextResponse.json({
    characters: owned,
    segments: segments.map(({ label, weight }) => ({ label, weight })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const characterId = Number(body?.characterId);
  const bet = Number(body?.bet);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  if (!Number.isInteger(bet) || bet <= 0) {
    return NextResponse.json({ error: "La apuesta debe ser un entero mayor que 0." }, { status: 400 });
  }

  const character = await db.orm.public.Character
    .where({ id: characterId })
    .first();

  if (!character || Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Ese personaje no te pertenece." }, { status: 403 });
  }

  let result;

  try {
    result = await db.transaction(async (tx) => {
    const resource = await tx.orm.public.CharacterResource
      .where({ characterId })
      .first();

    if (!resource) {
      throw new Error("Los recursos del personaje no están disponibles.");
    }

    const money = Number(resource.money);
    const karma = Number(resource.karma);

    if (karma < 1) {
      throw new Error("Necesitas al menos 1 karma para girar.");
    }

    if (bet > money) {
      throw new Error("La apuesta no puede superar el dinero disponible.");
    }

    let roll = Math.random() * totalWeight;
    let segmentIndex = segments.length - 1;

    for (let index = 0; index < segments.length; index += 1) {
      if (roll < segments[index].weight) {
        segmentIndex = index;
        break;
      }
      roll -= segments[index].weight;
    }

    const segment = segments[segmentIndex];
    const payout = Math.round(bet * segment.multiplier);
    const newMoney = money + payout;
    const newKarma = karma - 1;

    await tx.orm.public.CharacterResource
      .where({ id: resource.id })
      .update({
        money: newMoney,
        karma: newKarma,
      });

      return {
        segmentIndex,
        label: segment.label,
        payout,
        money: newMoney,
        karma: newKarma,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar el giro.";
    const knownErrors = new Set([
      "Los recursos del personaje no están disponibles.",
      "Necesitas al menos 1 karma para girar.",
      "La apuesta no puede superar el dinero disponible.",
    ]);

    if (knownErrors.has(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: "No se pudo completar el giro." }, { status: 500 });
  }

  return NextResponse.json(result);
}
