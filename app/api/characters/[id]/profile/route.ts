import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

const ALLOWED_GENDERS = ["masculino", "femenino", "indefinido"] as const;
type AllowedGender = (typeof ALLOWED_GENDERS)[number];

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) {
    return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
  }

  if (Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "magicAttackType") || Object.prototype.hasOwnProperty.call(body ?? {}, "blockDefenseType") || Object.prototype.hasOwnProperty.call(body ?? {}, "fieldDefenseType")) {
    const magicAttackType = String(body?.magicAttackType ?? character.magicAttackType ?? "CUT").trim().toUpperCase();
    const blockDefenseType = String(body?.blockDefenseType ?? (character as any).blockDefenseType ?? "CONCENTRATED").trim().toUpperCase();
    const fieldDefenseType = String(body?.fieldDefenseType ?? (character as any).fieldDefenseType ?? "CONCENTRATED").trim().toUpperCase();
    if (!["CUT", "BLUNT", "PIERCE"].includes(magicAttackType)) return NextResponse.json({ error: "Tipo de ataque mágico inválido." }, { status: 400 });
    if (!["CONCENTRATED", "DISPERSED", "SOLID"].includes(blockDefenseType) || !["CONCENTRATED", "DISPERSED", "SOLID"].includes(fieldDefenseType)) return NextResponse.json({ error: "Tipo de defensa inválido." }, { status: 400 });
    await db.orm.public.Character.where({ id: characterId, userId: user.id }).update({ magicAttackType, blockDefenseType, fieldDefenseType });
    await recordAuditEvent({ actorUserId: user.id, action: "CHARACTER_COMBAT_TYPE_UPDATE", entityType: "CHARACTER", entityId: characterId, characterId, details: { magicAttackType, blockDefenseType, fieldDefenseType } });
    return NextResponse.json({ id: characterId, magicAttackType, blockDefenseType, fieldDefenseType });
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "flair")) {
    const flair = body?.flair === null ? "" : String(body?.flair ?? "").trim();
    if (flair.length > 80) {
      return NextResponse.json({ error: "El flair no puede superar 80 caracteres." }, { status: 400 });
    }

    await db.orm.public.Character.where({ id: characterId, userId: user.id }).update({
      flair: flair || null,
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "CHARACTER_FLAIR_UPDATE",
      entityType: "CHARACTER",
      entityId: characterId,
      characterId,
      details: { flair: flair || null },
    });

    return NextResponse.json({ id: characterId, flair: flair || null });
  }

  const age = body?.age === null || body?.age === "" ? null : Number(body?.age);
  const height = body?.height === null || body?.height === "" ? null : Number(body?.height);
  const gender = body?.gender === null || body?.gender === "" ? null : String(body?.gender).trim().toLowerCase();

  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 1000)) {
    return NextResponse.json({ error: "La edad debe ser un número entero válido." }, { status: 400 });
  }

  if (height !== null && (!Number.isInteger(height) || height <= 0 || height > 1000)) {
    return NextResponse.json({ error: "La altura debe ser un número entero en centímetros." }, { status: 400 });
  }

  if (gender !== null && !ALLOWED_GENDERS.includes(gender as AllowedGender)) {
    return NextResponse.json(
      { error: "El género debe ser masculino, femenino o indefinido." },
      { status: 400 }
    );
  }

  const current = {
    age: character.age == null ? null : Number(character.age),
    gender: character.gender == null ? null : String(character.gender),
    height: character.height == null ? null : Number(character.height),
  };

  if (current.age !== null || current.gender !== null || current.height !== null) {
    return NextResponse.json(
      { error: "Los datos básicos del personaje ya fueron establecidos y no pueden modificarse." },
      { status: 409 }
    );
  }

  if (age === null || gender === null || height === null) {
    return NextResponse.json(
      { error: "Debes establecer edad, género y altura al mismo tiempo." },
      { status: 400 }
    );
  }

  const updated = await db.orm.public.Character.where({
    id: characterId,
    age: null,
    gender: null,
    height: null,
  }).update({ age, gender, height });

  if (!updated) {
    return NextResponse.json(
      { error: "Los datos básicos del personaje ya fueron establecidos y no pueden modificarse." },
      { status: 409 }
    );
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: "CHARACTER_PROFILE_SET",
    entityType: "CHARACTER",
    entityId: characterId,
    characterId,
    details: { age, gender, height },
  });

  return NextResponse.json({ id: characterId, age, gender, height });
}
