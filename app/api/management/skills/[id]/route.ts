import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
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
  if (!name || name.length > 120 || !description || !Number.isInteger(cost) || cost < 0) {
    return NextResponse.json({ error: "Datos de habilidad inválidos." }, { status: 400 });
  }

  const approve = body.approve === true;
  const reject = body.reject === true;
  let updated: any;
  let refundedCredit = false;
  let skillCreationCredits: number | null = null;

  try {
    const result = await db.transaction(async (tx) => {
      const TxSkill = (tx.orm.public as any).Skill;
      const TxCharacter = tx.orm.public.Character as any;

      const freshSkill = await TxSkill.where({ id }).first();
      if (!freshSkill) throw new Error("SKILL_NOT_FOUND");

      const shouldRefund = reject && String(freshSkill.status) !== "REJECTED";

      await TxSkill.where({ id }).update({
        name,
        cost,
        description,
        duration: typeof body.duration === "string" ? body.duration.trim() || null : (freshSkill.duration ?? null),
        category,
        areaOfEffect: typeof body.areaOfEffect === "string" ? body.areaOfEffect.trim() || null : (freshSkill.areaOfEffect ?? null),
        speed: typeof body.speed === "string" ? body.speed.trim() || null : (freshSkill.speed ?? null),
        cooldown: typeof body.cooldown === "string" ? body.cooldown.trim() || null : (freshSkill.cooldown ?? null),
        effect,
        condition: typeof body.condition === "string" ? body.condition.trim() || null : (freshSkill.condition ?? null),
        status: approve ? "APPROVED" : reject ? "REJECTED" : String(freshSkill.status),
        approvedAt: approve
          ? Temporal.Instant.fromEpochMilliseconds(Date.now())
          : reject
            ? null
            : (freshSkill.approvedAt ?? null),
        updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
      });

      if (shouldRefund) {
        const character = await TxCharacter.where({ id: Number(freshSkill.characterId) }).first();
        if (!character) throw new Error("CHARACTER_NOT_FOUND");

        const credits = Number(character.skillCreationCredits ?? 0);
        skillCreationCredits = credits + 1;
        refundedCredit = true;

        await TxCharacter.where({ id: Number(freshSkill.characterId) }).update({
          skillCreationCredits: credits + 1,
        });
      }

      const refreshed = await TxSkill.where({ id }).first();
      if (!refreshed) throw new Error("SKILL_UPDATE_NOT_FOUND");

      return refreshed;
    });

    updated = result;
  } catch (error) {
    console.error("[management/skills] PATCH failed", error);
    if (error instanceof Error && error.message === "SKILL_NOT_FOUND") {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CHARACTER_NOT_FOUND") {
      return NextResponse.json({ error: "No se encontró el personaje de la habilidad." }, { status: 500 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo actualizar la habilidad.",
    }, { status: 500 });
  }

  // La auditoría no debe convertir una operación ya realizada en un error
  // para el usuario. Si falla, la aprobación/rechazo ya quedó guardada.
  try {
    await recordAuditEvent({
      actorUserId: admin.id,
      action: approve ? "SKILL_APPROVE" : reject ? "SKILL_REJECT" : "SKILL_UPDATE",
      entityType: "SKILL",
      entityId: id,
      characterId: Number(updated.characterId),
      details: {
        before: skill,
        after: updated,
        refundedSkillCrystal: refundedCredit,
        skillCreationCredits,
      },
    });
  } catch (auditError) {
    console.error("[management/skills] audit failed after successful update", auditError);
  }

  return NextResponse.json({
    skill: updated,
    refundedSkillCrystal: refundedCredit,
    ...(skillCreationCredits !== null ? { skillCreationCredits } : {}),
  });
}
