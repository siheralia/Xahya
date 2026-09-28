import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Mode = "exact" | "highlow" | "evenodd" | "range";

function isValidInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function rollD20(luck: number, preferred: number[]) {
  const clampedLuck = Math.max(1, luck);
  let bonus = 0;

  if (clampedLuck > 20) {
    bonus = Math.min(0.08, (clampedLuck - 20) * 0.008);
  } else if (clampedLuck < 10) {
    bonus = -Math.min(0.2, (10 - clampedLuck) * 0.02);
  }

  const weights = Array.from({ length: 20 }, (_, index) => {
    const face = index + 1;
    const preferredFace = preferred.includes(face);
    if (bonus >= 0) return preferredFace ? 1 + bonus : 1 - bonus * 0.35;
    return preferredFace ? 1 + bonus : 1 - bonus * 0.35;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * total;

  for (let index = 0; index < weights.length; index += 1) {
    random -= weights[index];
    if (random <= 0) return index + 1;
  }

  return 20;
}

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);

  if (!currentUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const characters = await db.orm.public.Character
    .where({ userId: currentUser.id })
    .all();

  const result = [];

  for (const character of characters) {
    const resources = await db.orm.public.CharacterResource
      .where({ characterId: character.id })
      .first();
    const stats = await db.orm.public.CharacterStat
      .where({ characterId: character.id })
      .first();

    if (!resources || !stats) continue;

    result.push({
      id: character.id,
      name: character.name,
      money: Number(resources.money),
      karma: Number(resources.karma),
      luck: Number(stats.luck),
    });
  }

  return NextResponse.json({ characters: result });
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const characterId = Number(body.characterId);
  const bet = Number(body.bet);
  const mode = body.mode as Mode;
  const target = Number(body.target);

  if (!isValidInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  }

  if (!isValidInteger(bet) || bet <= 0) {
    return NextResponse.json({ error: "La apuesta debe ser un entero mayor que 0." }, { status: 400 });
  }

  if (!["exact", "highlow", "evenodd", "range"].includes(mode)) {
    return NextResponse.json({ error: "Modo de juego inválido." }, { status: 400 });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);

  if (!currentUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const character = await db.orm.public.Character
    .where({ id: characterId })
    .first();

  if (!character || Number(character.userId) !== Number(currentUser.id)) {
    return NextResponse.json({ error: "No tienes acceso a este personaje." }, { status: 403 });
  }

  const resources = await db.orm.public.CharacterResource
    .where({ characterId })
    .first();
  const stats = await db.orm.public.CharacterStat
    .where({ characterId })
    .first();

  if (!resources || !stats) {
    return NextResponse.json({ error: "Datos del personaje incompletos." }, { status: 500 });
  }

  if (Number(resources.karma) < 1) {
    return NextResponse.json({ error: "Necesitas al menos 1 karma para jugar." }, { status: 400 });
  }

  if (bet > Number(resources.money)) {
    return NextResponse.json({ error: "No puedes apostar más dinero del que tienes." }, { status: 400 });
  }

  if (mode === "exact" && (!isValidInteger(target) || target < 1 || target > 20)) {
    return NextResponse.json({ error: "Elige un número del 1 al 20." }, { status: 400 });
  }

  const preferred =
    mode === "exact"
      ? [target]
      : mode === "highlow"
        ? target === 1 ? Array.from({ length: 10 }, (_, index) => index + 11) : Array.from({ length: 10 }, (_, index) => index + 1)
        : mode === "evenodd"
          ? target === 1 ? [2,4,6,8,10,12,14,16,18,20] : [1,3,5,7,9,11,13,15,17,19]
          : [15,16,17,18,19,20];

  const roll = rollD20(Number(stats.luck), preferred);

  let won = false;
  let multiplier = -1;

  if (mode === "exact") {
    won = roll === target;
    multiplier = won ? 15 : -1;
  } else if (mode === "highlow") {
    won = target === 1 ? roll >= 11 : roll <= 10;
    multiplier = won ? 1 : -1;
  } else if (mode === "evenodd") {
    won = target === 1 ? roll % 2 === 0 : roll % 2 !== 0;
    multiplier = won ? 1 : -1;
  } else {
    won = roll >= 15;
    multiplier = won ? 3 : -1;
  }

  const payout = Math.round(bet * multiplier);
  const finalMoney = Number(resources.money) + payout;
  const finalKarma = Number(resources.karma) - 1;

  await db.orm.public.CharacterResource
    .where({ id: resources.id })
    .update({
      money: finalMoney,
      karma: finalKarma,
    });

  return NextResponse.json({
    roll,
    won,
    payout,
    money: finalMoney,
    karma: finalKarma,
  });
}
