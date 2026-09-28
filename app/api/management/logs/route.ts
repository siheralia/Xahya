import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const TYPE_ACTIONS: Record<string, string[]> = {
  Personaje: ["CHARACTER_CREATED", "CHARACTER_RENAME", "CHARACTER_DELETE", "CHARACTER_TRANSFER"],
  Estadísticas: ["STAT_UPDATE"],
  Recursos: ["RESOURCE_GRANT", "GLOBAL_REWARD"],
  "Level Up": ["LEVEL_UP"],
  Karma: ["KARMA_BOOST"],
  Sistema: ["USER_ROLE_CHANGE", "USER_DELETE", "LOGIN_REWARD"],
};

export async function GET(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);
  if (!currentUser || !["GM", "ADMIN"].includes(String(currentUser.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const type = url.searchParams.get("type") ?? "Todos";
  const range = url.searchParams.get("range") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? "50") || 50));

  const allLogs = await db.orm.public.AuditLog.all();
  const characters = await db.orm.public.Character.all();

  const now = Date.now();
  const rangeMs: Record<string, number> = {
    today: 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = rangeMs[range] ? now - rangeMs[range] : null;
  const allowedActions = TYPE_ACTIONS[type];

  const filtered = allLogs
    .filter((log) => !allowedActions || allowedActions.includes(String(log.action)))
    .filter((log) => !cutoff || new Date(String(log.createdAt)).getTime() >= cutoff)
    .map((log) => {
      const actor = users.find((user) => Number(user.id) === Number(log.actorUserId));
      const character = characters.find((item) => Number(item.id) === Number(log.characterId ?? log.entityId));
      let details: unknown = null;
      if (log.details) {
        try { details = JSON.parse(String(log.details)); } catch { details = String(log.details); }
      }
      return {
        id: Number(log.id),
        action: String(log.action),
        entityType: String(log.entityType),
        entityId: log.entityId == null ? null : Number(log.entityId),
        characterId: log.characterId == null ? null : Number(log.characterId),
        actor: actor ? { id: Number(actor.id), name: actor.name ?? "Sin nombre", role: String(actor.role) } : null,
        targetUserId: log.targetUserId == null ? null : Number(log.targetUserId),
        characterName: character?.name ?? null,
        details,
        createdAt: log.createdAt,
      };
    })
    .filter((log) => {
      if (!search) return true;
      return [
        log.action,
        log.entityType,
        log.characterName,
        log.actor?.name,
        log.actor?.role,
        JSON.stringify(log.details),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    })
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    summary: {
      events: total,
      users: new Set(filtered.map((log) => log.actor?.id).filter(Boolean)).size,
      latest: filtered[0]?.createdAt ?? null,
    },
  });
}
