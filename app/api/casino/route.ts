import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { getCasinoLuckAdjustedWeights, type CasinoSet } from "@/lib/casino";
import { getActiveCasinoSet as getScheduledActiveCasinoSet } from "@/lib/casino-schedule";

// RULE NOTE: 0 charges the wager once (-bet). -100% charges the wager twice (-2 × bet).
// Positive results only add their profit; they do not refund the wager separately. Negative money is allowed and represents debt to the casino.
async function getActiveCasinoSet(): Promise<CasinoSet> {
  return (await getScheduledActiveCasinoSet()).set;
}

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characters = await db.orm.public.Character.all();
  const resources = await db.orm.public.CharacterResource.all();

  const activeSet = await getActiveCasinoSet();

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

  const requestedCharacterId = Number(new URL(request.url).searchParams.get("characterId"));
  let history: Array<{
    id: number;
    createdAt: string;
    bet: number;
    label: string;
    payout: number;
    moneyAfter: number;
    karmaAfter: number;
  }> = [];

  if (Number.isInteger(requestedCharacterId) && requestedCharacterId > 0) {
    const ownsCharacter = owned.some((character) => character.id === requestedCharacterId);
    if (ownsCharacter) {
      const logs = await db.orm.public.AuditLog
        .where({ characterId: requestedCharacterId, action: "CASINO_ROULETTE" })
        .all();

      history = logs
        .map((log) => {
          const details = typeof log.details === "string"
            ? JSON.parse(log.details)
            : (log.details ?? {});
          return {
            id: Number(log.id),
            createdAt: String(log.createdAt),
            bet: Number(details.bet ?? 0),
            label: String(details.result ?? ""),
            payout: Number(details.payout ?? 0),
            moneyAfter: Number(details.moneyAfter ?? 0),
            karmaAfter: Number(details.karmaAfter ?? 0),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  return NextResponse.json({
    characters: owned,
    activeSet: { id: activeSet.id, name: activeSet.name },
    segments: activeSet.segments.map(({ label, weight, color }) => ({ label, weight, color })),
    history,
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
  const requestedCount = Number(body?.count ?? 1);
  const count = Number.isInteger(requestedCount) ? Math.min(10, Math.max(1, requestedCount)) : 1;

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
      const resource = await tx.orm.public.CharacterResource.where({ characterId }).first();
      if (!resource) throw new Error("Los recursos del personaje no están disponibles.");

      let money = Number(resource.money);
      let karma = Number(resource.karma);
      if (karma < count) throw new Error("No tienes suficiente karma para completar las tiradas.");
      if (bet > money) throw new Error("La apuesta no puede superar el dinero disponible.");

      const stats = await tx.orm.public.CharacterStat.where({ characterId }).first();
      const luck = Number(stats?.luck ?? 0);
      const activeSet = await getActiveCasinoSet();
      const segments = activeSet.segments;
      const adjustedWeights = getCasinoLuckAdjustedWeights(segments, luck);
      const adjustedTotalWeight = adjustedWeights.reduce((sum, weight) => sum + weight, 0);
      const results = [];

      for (let rollNumber = 0; rollNumber < count; rollNumber += 1) {
        let roll = Math.random() * adjustedTotalWeight;
        let segmentIndex = segments.length - 1;

        for (let index = 0; index < segments.length; index += 1) {
          if (roll < adjustedWeights[index]) {
            segmentIndex = index;
            break;
          }
          roll -= adjustedWeights[index];
        }

        const segment = segments[segmentIndex];
        const payout = Math.round(bet * segment.multiplier);
        money += payout;
        karma -= 1;
        results.push({ segmentIndex, label: segment.label, payout, money, karma });
      }

      await tx.orm.public.CharacterResource.where({ id: resource.id }).update({ money, karma });
      return {
        ...results[results.length - 1],
        results,
        activeSet: { id: activeSet.id, name: activeSet.name },
        segments: segments.map(({ label, weight, color }) => ({ label, weight, color })),
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar el giro.";
    const knownErrors = new Set([
      "Los recursos del personaje no están disponibles.",
      "No tienes suficiente karma para completar las tiradas.",
      "La apuesta no puede superar el dinero disponible.",
    ]);

    if (knownErrors.has(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: "No se pudo completar el giro." }, { status: 500 });
  }

  for (const roll of result.results) {
    await recordAuditEvent({
      actorUserId: user.id,
      action: "CASINO_ROULETTE",
      entityType: "CHARACTER",
      entityId: characterId,
      characterId,
      details: {
        bet,
        result: roll.label,
        payout: roll.payout,
        moneyAfter: roll.money,
        karmaAfter: roll.karma,
      },
    });
  }

  return NextResponse.json(result);
}
