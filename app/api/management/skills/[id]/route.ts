import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  const Skill = (db.orm.public as any).Skill;
  const skill = await Skill.where({ id }).first();
  if (!skill) return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body.name === "string" ? body.name.trim() : String(skill.name);
  const description = typeof body.description === "string" ? body.description.trim() : String(skill.description ?? "");
  const cost = Number(body.cost ?? skill.cost);
  const category = String(body.category ?? skill.category);
  const effect = Array.isArray(body.effect) ? body.effect : (Array.isArray(skill.effect) ? skill.effect : []);
  if (!name || name.length > 120 || !description || !Number.isInteger(cost) || cost < 0) return NextResponse.json({ error: "Datos de habilidad inválidos." }, { status: 400 });

  const approve = body.approve === true;
  const reject = body.reject === true;
  const updated = await Skill.where({ id }).update({
    name,
    cost,
    description,
    duration: typeof body.duration === "string" ? body.duration.trim() || null : (skill.duration ?? null),
    category,
    areaOfEffect: typeof body.areaOfEffect === "string" ? body.areaOfEffect.trim() || null : (skill.areaOfEffect ?? null),
    speed: typeof body.speed === "string" ? body.speed.trim() || null : (skill.speed ?? null),
    cooldown: typeof body.cooldown === "string" ? body.cooldown.trim() || null : (skill.cooldown ?? null),
    effect,
    condition: typeof body.condition === "string" ? body.condition.trim() || null : (skill.condition ?? null),
    status: approve ? "APPROVED" : reject ? "REJECTED" : String(skill.status),
    approvedAt: approve ? new Date() : reject ? null : (skill.approvedAt ?? null),
    updatedAt: new Date(),
  });

  await recordAuditEvent({
    actorUserId: admin.id,
    action: approve ? "SKILL_APPROVE" : reject ? "SKILL_REJECT" : "SKILL_UPDATE",
    entityType: "SKILL",
    entityId: id,
    characterId: Number(updated.characterId),
    details: { before: skill, after: updated },
  });
  return NextResponse.json({ skill: updated });
}
