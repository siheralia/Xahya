import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";

const RETURN_KARMA = 5;

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

    if (!user) {
      return { show: false as const };
    }

    if (user.lastLoginSessionId === sessionId) {
      return { show: false as const };
    }

    const previousLogin = user.lastLoginAt;
    const characters = (await tx.orm.public.Character.all()).filter(
      (character) => Number(character.userId) === Number(user.id),
    );

    const updatedUser = await tx.orm.public.User.where({
      id: user.id,
      lastLoginSessionId: user.lastLoginSessionId,
    }).update({
      lastLoginAt: now,
      lastLoginSessionId: sessionId,
    });

    if (!updatedUser) {
      return { show: false as const };
    }

    if (!previousLogin || characters.length === 0) {
      return { show: false as const };
    }

    const logs = await tx.orm.public.AuditLog.all();
    const previousTime = new Date(String(previousLogin)).getTime();

    const characterIds = new Set(characters.map((character) => Number(character.id)));
    const activity = logs.filter((log) => {
      const createdAt = new Date(String(log.createdAt)).getTime();
      if (!Number.isFinite(createdAt) || createdAt <= previousTime) return false;

      const characterId = log.characterId == null
        ? log.entityType === "CHARACTER" && log.entityId != null
          ? Number(log.entityId)
          : null
        : Number(log.characterId);

      return characterId != null && characterIds.has(characterId);
    });

    if (activity.length === 0) {
      return { show: false as const };
    }

    let updatedCharacters = 0;

    for (const character of characters) {
      const resources = await tx.orm.public.CharacterResource.where({
        characterId: character.id,
      }).first();

      if (!resources) continue;

      await tx.orm.public.CharacterResource.where({ id: resources.id }).update({
        karma: Number(resources.karma) + RETURN_KARMA,
      });

      updatedCharacters += 1;
    }

    await tx.orm.public.AuditLog.create({
      actorUserId: user.id,
      action: "LOGIN_REWARD",
      entityType: "SYSTEM",
      entityId: null,
      characterId: null,
      targetUserId: user.id,
      details: JSON.stringify({
        reward: "RETURN_KARMA",
        karma: RETURN_KARMA,
        activityEvents: activity.length,
        characterIds: [...characterIds],
        previousLogin: String(previousLogin),
      }),
    });

    return {
      show: updatedCharacters > 0,
      activityEvents: activity.length,
      updatedCharacters,
    };
  });

  return NextResponse.json(result);
}
