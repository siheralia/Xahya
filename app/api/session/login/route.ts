import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";

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

    const logs = await tx.orm.public.AuditLog.all();
    const previousTime = previousLogin
      ? new Date(String(previousLogin)).getTime()
      : null;

    const globalRewards = logs.filter((log) => {
      if (String(log.action) !== "GLOBAL_REWARD") return false;

      const createdAt = new Date(String(log.createdAt)).getTime();
      if (!Number.isFinite(createdAt)) return false;
      if (previousTime !== null && createdAt <= previousTime) return false;

      if (!log.details) return false;

      try {
        const details = JSON.parse(String(log.details)) as Record<string, unknown>;
        return details.allCharacters === true && Number(details.karma) === 5;
      } catch {
        return false;
      }
    });

    const updatedUser = await tx.orm.public.User.where({
      id: user.id,
      lastLoginSessionId: user.lastLoginSessionId,
    }).update({
      lastLoginAt: now,
      lastLoginSessionId: sessionId,
    });

    if (!updatedUser || globalRewards.length === 0) {
      return { show: false as const };
    }

    return {
      show: true as const,
      rewards: globalRewards.length,
    };
  });

  return NextResponse.json(result);
}
