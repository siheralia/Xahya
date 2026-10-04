import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";

const RELEVANT_ACTIONS = new Set([
  "GLOBAL_REWARD",
  "RESOURCE_GRANT",
  "KARMA_BOOST",
  "STAT_UPDATE",
  "CHARACTER_RENAME",
  "CHARACTER_TRANSFER",
  "CHARACTER_DELETE",
]);

function parseDetails(value: unknown) {
  if (!value) return null;
  try { return JSON.parse(String(value)) as Record<string, unknown>; }
  catch { return null; }
}

async function getContext() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

function relevantToUser(log: any, userId: number, characterIds: Set<number>) {
  const action = String(log.action);
  if (!RELEVANT_ACTIONS.has(action)) return false;
  const characterId = log.characterId ?? log.entityId;
  const belongsToCharacter = characterId != null && characterIds.has(Number(characterId));
  const targetsUser = log.targetUserId != null && Number(log.targetUserId) === userId;
  const details = parseDetails(log.details);
  const isGlobal = action === "GLOBAL_REWARD" && details?.allCharacters === true;
  return belongsToCharacter || targetsUser || isGlobal;
}

function formatEvent(log: any, characters: any[]) {
  const rawCharacterId = log.characterId ?? log.entityId;
  const characterId = rawCharacterId == null ? null : Number(rawCharacterId);
  const character = characterId
    ? characters.find((item) => Number(item.id) === characterId)
    : null;

  return {
    id: String(log.id),
    action: String(log.action),
    characterId: character ? characterId : null,
    characterName: character?.name ?? null,
    details: parseDetails(log.details),
    createdAt: log.createdAt,
  };
}

export async function GET() {
  const user = await getContext();
  if (!user) return NextResponse.json({ unreadCount: 0, items: [] });

  const characters = await db.orm.public.Character.all();
  const characterIds = new Set(
    characters.filter((c) => Number(c.userId) === Number(user.id)).map((c) => Number(c.id)),
  );
  const logs = await db.orm.public.AuditLog.all();
  const relevant = logs
    .filter((log) => relevantToUser(log, Number(user.id), characterIds))
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());

  const readAt = user.lastNotificationReadAt
    ? new Date(String(user.lastNotificationReadAt)).getTime()
    : null;

  const unreadCount = relevant.filter((log) => {
    if (readAt === null) return true;
    return new Date(String(log.createdAt)).getTime() > readAt;
  }).length;

  return NextResponse.json({
    unreadCount,
    items: relevant.slice(0, 100).map((log) => formatEvent(log, characters)),
  });
}

export async function POST() {
  const user = await getContext();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const now = Temporal.Instant.fromEpochMilliseconds(Date.now());
  const updated = await db.orm.public.User.where({ id: user.id }).update({
    lastNotificationReadAt: now,
  });

  return NextResponse.json({ ok: Boolean(updated) });
}
