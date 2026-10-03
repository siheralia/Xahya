import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EFFECT_TYPES, EFFECT_TARGETS } from "@/lib/effects/catalog";

const CATEGORIES = ["OFFENSIVE", "PASSIVE", "SUPPORT", "UTILITY"] as const;
const STAT_TARGETS = [
  "STR","AGI","CON","INT","WIS","CHA","SPI","LCK",
  "HP","MANA","PHYS_ATK","MAGIC_ATK","DEF","MAG_DEF",
  "PRECISION","CRITICAL","DISCOVERY","MIRACLE","INTIMIDATION",
  "CONQUEST","RACE","DODGE","STEALTH","DETECTION","ATTACK_TOTAL",
] as const;

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

function validate(body: any) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = String(body.category ?? "UTILITY");
  const cost = Number(body.cost ?? 0);
  const effect = Array.isArray(body.effect) ? body.effect : [];
  if (!name || name.length > 120) return "El nombre debe tener entre 1 y 120 caracteres.";
  if (!description || description.length > 5000) return "La descripción es obligatoria y no puede superar 5000 caracteres.";
  if (!CATEGORIES.includes(category as any)) return "Categoría de habilidad inválida.";
  if (!Number.isInteger(cost) || cost < 0) return "El coste debe ser un entero no negativo.";
  if (category === "PASSIVE" && !String(body.condition ?? "").trim()) return "Las habilidades pasivas deben indicar una condición.";
  if (effect.length > 20) return "Una habilidad no puede tener más de 20 efectos.";
  for (const row of effect) {
    if (!row || typeof row !== "object" || !EFFECT_TYPES.includes(String(row.type) as any)) return "Efecto de habilidad inválido.";
    const type = String(row.type);
    const target = String(row.target ?? "");
    if (type === "NARRATIVE") {
      if (!String(row.description ?? "").trim()) return "Los efectos narrativos necesitan una descripción.";
      continue;
    }
    const allowedTargets = EFFECT_TARGETS[type as keyof typeof EFFECT_TARGETS] ?? [];
    if (!allowedTargets.includes(target as any)) return "Objetivo de efecto inválido.";
    const value = Number(row.value);
    if (!Number.isFinite(value) || value <= 0) return "Valor de efecto inválido.";
    if (type === "DAMAGE_MULTIPLIER" && !["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"].includes(target)) {
      return "Un multiplicador de daño debe apuntar a un tipo de ataque.";
    }
    if (type === "STAT_MULTIPLIER" && !Number.isFinite(value)) return "Multiplicador de estadística inválido.";
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });

  const Character = db.orm.public.Character;
  const character = await Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const Skill = (db.orm.public as any).Skill;
  if (!Skill) return NextResponse.json({ skills: [], pendingSkills: [] });

  const rows = await Skill.where({ characterId }).all();
  const skills = rows.filter((row: any) => String(row.status) === "APPROVED");
  const pendingSkills = Number(character.userId) === Number(user.id)
    ? rows.filter((row: any) => String(row.status) !== "APPROVED")
    : [];

  return NextResponse.json({
    skills,
    pendingSkills,
    skillCreationCredits: Number((character as any).skillCreationCredits ?? 0),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character || Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const validationError = validate(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const Skill = (db.orm.public as any).Skill;
  if (!Skill) return NextResponse.json({ error: "El sistema de habilidades aún no está disponible." }, { status: 500 });

  const Character = db.orm.public.Character as any;
  const currentCredits = Number((character as any).skillCreationCredits ?? 0);
  if (currentCredits <= 0) {
    return NextResponse.json({ error: "Necesitas usar un Cristal de habilidad antes de crear una habilidad." }, { status: 400 });
  }

  const created = await db.transaction(async (tx) => {
    const TxCharacter = tx.orm.public.Character as any;
    const fresh = await TxCharacter.where({ id: characterId }).first();
    const credits = Number(fresh?.skillCreationCredits ?? 0);
    if (credits <= 0) throw new Error("NO_SKILL_CREDIT");

    const skill = await (tx.orm.public as any).Skill.create({
      characterId,
      name: body.name.trim(),
      cost: Number(body.cost),
      description: body.description.trim(),
      duration: typeof body.duration === "string" ? body.duration.trim() || null : null,
      category: String(body.category),
      areaOfEffect: typeof body.areaOfEffect === "string" ? body.areaOfEffect.trim() || null : null,
      speed: typeof body.speed === "string" ? body.speed.trim() || null : null,
      cooldown: typeof body.cooldown === "string" ? body.cooldown.trim() || null : null,
      effect: body.effect,
      condition: typeof body.condition === "string" ? body.condition.trim() || null : null,
      status: "PENDING",
    });
    await TxCharacter.where({ id: characterId }).update({ skillCreationCredits: credits - 1 });
    return skill;
  }).catch((error) => {
    if (error instanceof Error && error.message === "NO_SKILL_CREDIT") return null;
    throw error;
  });

  if (!created) return NextResponse.json({ error: "Ya no tienes un permiso disponible para crear habilidades." }, { status: 400 });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "SKILL_SUBMIT",
    entityType: "SKILL",
    entityId: Number(created.id),
    characterId,
    details: { name: created.name, category: created.category },
  });

  return NextResponse.json({ skill: created, status: "PENDING" }, { status: 201 });
}
