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

const CATEGORIES = ["OFFENSIVE", "PASSIVE", "SUPPORT", "UTILITY"] as const;

function validate(body: any) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = String(body.category ?? "UTILITY");
  const cost = Number(body.cost ?? 0);
  const effect = Array.isArray(body.effect) ? body.effect : [];
  if (!name || name.length > 120) return "El nombre debe tener entre 1 y 120 caracteres.";
  if (!description || description.length > 5000) return "La descripción es obligatoria.";
  if (!CATEGORIES.includes(category as any)) return "Categoría inválida.";
  if (!Number.isInteger(cost) || cost < 0) return "Coste inválido.";
  if (effect.length > 20) return "Demasiados efectos.";
  return null;
}

export async function GET() {
  const admin = await getAdmin();
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
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const Skill = (db.orm.public as any).Skill;
  const skill = await Skill.create({
    characterId: Number(body.characterId),
    name: body.name.trim(),
    cost: Number(body.cost),
    description: body.description.trim(),
    duration: typeof body.duration === "string" ? body.duration.trim() || null : null,
    category: String(body.category),
    areaOfEffect: typeof body.areaOfEffect === "string" ? body.areaOfEffect.trim() || null : null,
    speed: typeof body.speed === "string" ? body.speed.trim() || null : null,
    cooldown: typeof body.cooldown === "string" ? body.cooldown.trim() || null : null,
    effect: Array.isArray(body.effect) ? body.effect : [],
    condition: typeof body.condition === "string" ? body.condition.trim() || null : null,
    status: body.status === "APPROVED" ? "APPROVED" : "PENDING",
    approvedAt: body.status === "APPROVED" ? new Date() : null,
  });
  await recordAuditEvent({ actorUserId: admin.id, action: "SKILL_CREATE", entityType: "SKILL", entityId: Number(skill.id), characterId: Number(skill.characterId), details: { name: skill.name, status: skill.status } });
  return NextResponse.json({ skill }, { status: 201 });
}
