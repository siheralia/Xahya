import { validEffectRequirements, effectRequirementDiscount, meetsEffectRequirements } from "@/lib/skills/effect-requirements";
import { validateSkillPrerequisites } from "@/lib/skills/prerequisites";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeSkillRange } from "@/lib/skills/range-storage";
import { recordAuditEvent } from "@/lib/audit";
import { hasRolePermission } from "@/lib/role-permissions";

async function getAdmin(action: "view" | "edit") {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && await hasRolePermission(user, "management.skills", action) ? user : null;
}

const CATEGORIES = ["OFFENSIVE", "PASSIVE", "SUPPORT", "UTILITY", "BASIC"] as const;

function validate(body: any) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = String(body.category ?? "UTILITY");
  const cost = Number(body.cost ?? 0);
  const effect = Array.isArray(body.effect) ? body.effect : [];
  if (!name || name.length > 120) return "El nombre debe tener entre 1 y 120 caracteres.";
  if (!description || description.length > 5000) return "La descripción es obligatoria.";
  if (!CATEGORIES.includes(category as any)) return "Categoría inválida.";
  const maintenanceCost = Number(body.maintenanceCost ?? 0);
  const accumulationCost = Number(body.accumulationCost ?? 0);
  const accumulationPerTick = Number(body.accumulationPerTick ?? 0);
  if (!Number.isInteger(cost) || cost < 0) return "Coste inválido.";
  if (!Number.isInteger(maintenanceCost) || maintenanceCost < 0 || !Number.isInteger(accumulationCost) || accumulationCost < 0 || !Number.isInteger(accumulationPerTick) || accumulationPerTick < 0) return "Costo de mantenimiento por turno inválido.";
  if (effect.length > 20) return "Demasiados efectos.";
  return null;
}

export async function GET() {
  const admin = await getAdmin("view");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const Skill = (db.orm.public as any).Skill;
  if (!Skill) return NextResponse.json({ skills: [] });
  const skills = await Skill.all();
  const characters = await db.orm.public.Character.all();
  return NextResponse.json({
    skills: skills.map((skill: any) => ({
      ...skill,
      character: characters.find((character) => Number(character.id) === Number(skill.characterId)) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const admin = await getAdmin("edit");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const Skill = (db.orm.public as any).Skill;
  const characterId = Number(body.characterId);
  const effectRequirements = body.effectRequirements ?? [];
  if (!validEffectRequirements(effectRequirements)) return NextResponse.json({error:"Requisitos por efecto inválidos."},{status:400});
  if (!Number.isSafeInteger(characterId) || characterId <= 0 || !validEffectRequirements(effectRequirements)) return NextResponse.json({error:"Personaje o requisitos inválidos."},{status:400});
  const pchCost = Number(body.pchCost ?? 0);
  if (!Number.isSafeInteger(pchCost) || pchCost < 0) return NextResponse.json({error:"Costo PCH inválido."},{status:400});
  const action = body.approve === true ? "approve" : body.reject === true ? "reject" : null;
  if (body.approve === true && body.reject === true) return NextResponse.json({error:"No puedes aprobar y rechazar al mismo tiempo."},{status:400});
  if (action && !(await hasRolePermission(admin,"management.skills",action))) return NextResponse.json({error:"Sin permiso para aprobar o rechazar."},{status:403});
  const status = body.approve === true ? "APPROVED" : body.reject === true ? "REJECTED" : "PENDING";
  const skill = await Skill.create({
    effectRequirements,
    pchCost,
    characterId: Number(body.characterId),
    name: body.name.trim(),
    cost: Number(body.cost),
    maintenanceCost: Number(body.maintenanceCost ?? 0),
      accumulationCost: Number(body.accumulationCost ?? 0),
      accumulationPerTick: Number(body.accumulationPerTick ?? 0),
    description: body.description.trim(),
    duration: typeof body.duration === "string" ? body.duration.trim() || null : null,
    category: String(body.category),
    areaOfEffect: serializeSkillRange(body.areaOfEffect,body.maxRangeMeters??5),
    speed: typeof body.speed === "string" ? body.speed.trim() || null : null,
    cooldown: typeof body.cooldown === "string" ? body.cooldown.trim() || null : null,
    effect: Array.isArray(body.effect) ? body.effect : [],
    condition: typeof body.condition === "string" ? body.condition.trim() || null : null,
    status,
    approvedAt: status === "APPROVED" ? new Date() : null,
  });
  await recordAuditEvent({ actorUserId: admin.id, action: "SKILL_CREATE", entityType: "SKILL", entityId: Number(skill.id), characterId: Number(skill.characterId), details: { name: skill.name, status: skill.status } });
  return NextResponse.json({ skill }, { status: 201 });
}
