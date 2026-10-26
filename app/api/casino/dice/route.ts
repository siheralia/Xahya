import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readMechanics, getCharacterMechanicValue } from "@/lib/stats/mechanics";
import { readBalance, type BalanceSettings } from "@/lib/stats/balance";

type Mode = "exact" | "highlow" | "evenodd" | "range";

function isValidInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function rollD20(luck: number, preferred: number[], balance: BalanceSettings) {
  const clampedLuck = Math.max(1, luck);
  let bonus = 0;

  if (clampedLuck > balance.casinoHigh) {
    bonus = Math.min(balance.casinoBonusMax, (clampedLuck - balance.casinoHigh) * balance.casinoBonusRate);
  } else if (clampedLuck < balance.casinoLow) {
    bonus = -Math.min(balance.casinoPenaltyMax, (balance.casinoLow - clampedLuck) * balance.casinoPenaltyRate);
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
  const mechanics = await readMechanics();

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
      luck: await getCharacterMechanicValue(Number(character.id), mechanics.casinoInfluence),
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

  if (mode === "exact" && (!isValidInteger(target) || target < 1 || target > 20)) {
    return NextResponse.json({ error: "Elige un número del 1 al 20." }, { status: 400 });
  }

  const preferred =
    mode === "exact"
      ? [target]
      : mode === "highlow"
        ? target === 2 ? Array.from({ length: 10 }, (_, index) => index + 11) : Array.from({ length: 10 }, (_, index) => index + 1)
        : mode === "evenodd"
          ? target === 1 ? [2,4,6,8,10,12,14,16,18,20] : [1,3,5,7,9,11,13,15,17,19]
          : [16,17,18,19,20];

  const mechanics = await readMechanics();
  const balance = await readBalance();
  const influence = await getCharacterMechanicValue(characterId, mechanics.casinoInfluence);
  const roll = rollD20(influence, preferred, balance);

  let won = false;
  let multiplier = -1;

  if (mode === "exact") {
    won = roll === target;
    multiplier = won ? 19 : -1;
  } else if (mode === "highlow") {
    won = target === 2 ? roll >= 11 : roll <= 10;
    multiplier = won ? 1 : -1;
  } else if (mode === "evenodd") {
    won = target === 1 ? roll % 2 === 0 : roll % 2 !== 0;
    multiplier = won ? 1 : -1;
  } else {
    won = roll >= 16;
    multiplier = won ? 3 : -1;
  }

  const payout = Math.round(bet * multiplier);

  // The WHERE predicate is evaluated by PostgreSQL while it holds the row
  // update lock. Concurrent wagers cannot both spend the same starting funds.
  try {
    const result = await db.transaction(async (tx) => {
      const plan = db.raw.sql`
        UPDATE public."characterResource"
        SET "money" = "money" + ${payout}, "karma" = "karma" - 1
        WHERE "characterId" = ${characterId}
          AND "money" >= ${bet}
          AND "karma" >= 1
          AND "money" + ${payout} BETWEEN -2147483648 AND 2147483647
      `.affectedCount().build();
      const { affectedRows } = await tx.execute(plan);
      if (affectedRows !== 1) {
        throw new Error("WAGER_CONFLICT");
      }

      const resources = await tx.orm.public.CharacterResource
        .where({ characterId }).first();
      if (!resources) throw new Error("WAGER_CONFLICT");

      const finalMoney = Number(resources.money);
      const finalKarma = Number(resources.karma);

      // Required audit is committed or rolled back with the resource update.
      await tx.orm.public.AuditLog.create({
        actorUserId: currentUser.id,
        action: "CASINO_DICE",
        entityType: "CHARACTER",
        entityId: characterId,
        characterId,
        targetUserId: null,
        details: JSON.stringify({
          mode, target, bet, roll, won, payout,
          moneyAfter: finalMoney, karmaAfter: finalKarma,
        }),
      });

      return { roll, won, payout, money: finalMoney, karma: finalKarma };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "WAGER_CONFLICT") {
      return NextResponse.json({
        error: "Saldo o karma insuficiente, o apuesta concurrente. Actualiza tus recursos e inténtalo de nuevo.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo completar la tirada." }, { status: 500 });
  }
}
