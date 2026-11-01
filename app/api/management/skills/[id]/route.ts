import { validEffectRequirements, effectRequirementDiscount, meetsEffectRequirements } from "@/lib/skills/effect-requirements";
import { validateSkillPrerequisites, hasPrerequisiteCycle } from "@/lib/skills/prerequisites";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import { serializeSkillRange } from "@/lib/skills/range-storage";
import { recordAuditEvent } from "@/lib/audit";
import { hasRolePermission } from "@/lib/role-permissions";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const authorizationBody = await request.clone().json().catch(() => null);
  const requestedAction = authorizationBody?.approve === true ? "approve" : authorizationBody?.reject === true ? "reject" : "edit";
  if (authorizationBody?.approve === true && authorizationBody?.reject === true) return NextResponse.json({ error: "Acciones incompatibles." }, { status: 400 });
  if (!(await hasRolePermission(admin, "management.skills", requestedAction))) return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
  if (requestedAction !== "edit" && !(await hasRolePermission(admin, "management.skills", "edit"))) return NextResponse.json({ error: "Aprobar o rechazar con cambios requiere también permiso de edición." }, { status: 403 });
  const id = Number((await params).id);
  const Skill = (db.orm.public as any).Skill;
  const skill = await Skill.where({ id }).first();
  if (!skill) return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body.name === "string" ? body.name.trim() : String(skill.name);
  const description = typeof body.description === "string" ? body.description.trim() : String(skill.description ?? "");
  const cost = Number(body.cost ?? skill.cost);
  const maintenanceCost = Number(body.maintenanceCost ?? skill.maintenanceCost ?? 0);
  const accumulationCost = Number(body.accumulationCost ?? skill.accumulationCost ?? 0);
  const accumulationPerTick = Number(body.accumulationPerTick ?? skill.accumulationPerTick ?? 0);
  const category = String(body.category ?? skill.category);
  const effect = Array.isArray(body.effect) ? body.effect : (Array.isArray(skill.effect) ? skill.effect : []);
  if (!name || name.length > 120 || !description || !Number.isInteger(cost) || cost < 0 || !Number.isInteger(maintenanceCost) || maintenanceCost < 0 || !Number.isInteger(accumulationCost) || accumulationCost < 0 || !Number.isInteger(accumulationPerTick) || accumulationPerTick < 0) {
    return NextResponse.json({ error: "Datos de habilidad inválidos." }, { status: 400 });
  }

  const effectRequirements = body.effectRequirements ?? (skill as any).effectRequirements ?? [];
  if (!validEffectRequirements(effectRequirements)) return NextResponse.json({error:"Requisitos por efecto inválidos."},{status:400});
  const available = await Skill.where({characterId:Number(skill.characterId)}).all();

  const requestedPchCost = body.pchCost === undefined ? Number((skill as any).pchCost ?? 0) : Number(body.pchCost);
  if (!Number.isInteger(requestedPchCost) || requestedPchCost < 0) return NextResponse.json({ error: "Costo PCH inválido." }, { status: 400 });

  const approve = body.approve === true;
  const reject = body.reject === true;
  let updated: any;
  let refundedCredit = false;
  let pchBalance: number | null = null;
  let skillCreationCredits: number | null = null;

  try {
    const result = await db.transaction(async (tx) => {
      const TxSkill = (tx.orm.public as any).Skill;
      const TxCharacter = tx.orm.public.Character as any;

      // Lock the skill row before reading its charge/status to serialize approvals.
      const lock = db.raw.sql`
        UPDATE public."skill" SET "pchCost" = "pchCost" WHERE id = ${id}
      `.affectedCount().build();
      const { affectedRows: locked } = await tx.execute(lock);
      if (locked !== 1) throw new Error("SKILL_NOT_FOUND");
      const freshSkill = await TxSkill.where({ id }).first();
      if (!freshSkill) throw new Error("SKILL_NOT_FOUND");

      const oldPchCost = Number(freshSkill.pchCost ?? 0);
      const shouldRefund = reject && String(freshSkill.status) !== "REJECTED";
      const previousCharge = String(freshSkill.status) === "REJECTED" ? 0 : oldPchCost;
      const newCharge = reject ? 0 : requestedPchCost;
      const difference = previousCharge - newCharge;
      if (difference !== 0) {
        const adjust = db.raw.sql`
          UPDATE public."character"
          SET "pchBalance" = "pchBalance" + ${difference}
          WHERE id = ${Number(freshSkill.characterId)}
            AND "pchBalance" + ${difference} BETWEEN -2147483648 AND 2147483647
        `.affectedCount().build();
        const { affectedRows } = await tx.execute(adjust);
        if (affectedRows !== 1) throw new Error("PCH_ADJUST_CONFLICT");
        const character = await TxCharacter.where({ id: Number(freshSkill.characterId) }).first();
        pchBalance = Number(character?.pchBalance ?? 0);
      }

      await TxSkill.where({ id }).update({
        name,
        effectRequirements,
        cost,
        pchCost: requestedPchCost,
        maintenanceCost,
        accumulationCost,
      accumulationPerTick,
        description,
        duration: typeof body.duration === "string" ? body.duration.trim() || null : (freshSkill.duration ?? null),
        category,
        areaOfEffect: body.maxRangeMeters!==undefined ? serializeSkillRange(typeof body.areaOfEffect==="string"?body.areaOfEffect:freshSkill.areaOfEffect,body.maxRangeMeters) : (typeof body.areaOfEffect === "string" ? body.areaOfEffect.trim() || null : (freshSkill.areaOfEffect ?? null)),
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
        refundedSkillCrystal: false,
        pchCostBefore: Number((skill as any).pchCost ?? 0),
        pchCostAfter: requestedPchCost,
        pchBalance,
        skillCreationCredits,
      },
    });
  } catch (auditError) {
    console.error("[management/skills] audit failed after successful update", auditError);
  }

  return NextResponse.json({
    skill: updated,
    refundedSkillCrystal: false,
    pchBalance,
    ...(skillCreationCredits !== null ? { skillCreationCredits } : {}),
  });
}
