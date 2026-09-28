import { db } from "@/lib/db";

export type AuditEvent = {
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  characterId?: number | null;
  targetUserId?: number | null;
  details?: Record<string, unknown> | null;
};

export async function recordAuditEvent(event: AuditEvent) {
  return db.orm.public.AuditLog.create({
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    characterId: event.characterId ?? null,
    targetUserId: event.targetUserId ?? null,
    details: event.details ? JSON.stringify(event.details) : null,
  });
}
