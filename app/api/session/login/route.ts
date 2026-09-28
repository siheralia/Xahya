import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";

const RELEVANT_ACTIONS = new Set([
  "GLOBAL_REWARD",
  "RESOURCE_GRANT",
  "LEVEL_UP",
  "KARMA_BOOST",
  "STAT_UPDATE",
  "CHARACTER_RENAME",
  "CHARACTER_TRANSFER",
  "CHARACTER_DELETE",
  "CASINO_ROULETTE",
  "CASINO_BLACKJACK",
  "CASINO_DICE",
]);

function parseDetails(value: unknown) {
  if (!value) return null;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST() {
  const { userId: clerkId, sessionId } = await auth();

  if (!clerkId || !sessionId) {
    return NextResponse.json({ show: false });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);

  if (!currentUser) {
    return NextResponse.json({ show: false });
  }

  const now = Temporal.Instant.fromEpochMilliseconds(Date.now());

  const result = await db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: currentUser.id }).first();

    if (!user || user.lastLoginSessionId === sessionId) {
      return { show: false as const };
    }

    const previousLogin = user.lastLoginAt;
    const previousTime = previousLogin
      ? new Date(String(previousLogin)).getTime()
      : null;

    const characters = await tx.orm.public.Character.all();
    const characterIds = new Set(
      characters
        .filter((character) => Number(character.userId) === Number(user.id))
        .map((character) => Number(character.id)),
    );

    const logs = await tx.orm.public.AuditLog.all();

    const events = logs
      .filter((log) => {
        const action = String(log.action);
        if (!RELEVANT_ACTIONS.has(action)) return false;

        const createdAt = new Date(String(log.createdAt)).getTime();
        if (!Number.isFinite(createdAt)) return false;
        if (previousTime !== null && createdAt <= previousTime) return false;

        const characterId = log.characterId ?? log.entityId;
        const belongsToCharacter =
          characterId != null && characterIds.has(Number(characterId));

        const targetsUser =
          log.targetUserId != null &&
          Number(log.targetUserId) === Number(user.id);

        const isGlobal =
          action === "GLOBAL_REWARD" &&
          parseDetails(log.details)?.allCharacters === true;

        return belongsToCharacter || targetsUser || isGlobal;
      })
      .sort(
        (a, b) =>
          new Date(String(b.createdAt)).getTime() -
          new Date(String(a.createdAt)).getTime(),
      )
      .slice(0, 20)
      .map((log) => {
        const details = parseDetails(log.details);
        const rawCharacterId = log.characterId ?? log.entityId;
        const characterId =
          rawCharacterId != null && characterIds.has(Number(rawCharacterId))
            ? Number(rawCharacterId)
            : null;
        const character = characterId
          ? characters.find((item) => Number(item.id) === characterId)
          : null;

        return {
          id: String(log.id),
          action: String(log.action),
          characterId,
          characterName: character?.name ?? null,
          details,
          createdAt: log.createdAt,
        };
      });

    const updatedUser = await tx.orm.public.User.where({
      id: user.id,
      lastLoginSessionId: user.lastLoginSessionId,
    }).update({
      lastLoginAt: now,
      lastLoginSessionId: sessionId,
    });

    if (!updatedUser || events.length === 0) {
      return { show: false as const };
    }

    return {
      show: true as const,
      events,
    };
  });

  return NextResponse.json(result);
}
