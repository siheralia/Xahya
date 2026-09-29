import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

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
  const age = body?.age === null || body?.age === "" ? null : Number(body?.age);
  const height = body?.height === null || body?.height === "" ? null : Number(body?.height);
  const gender = body?.gender === null || body?.gender === "" ? null : String(body?.gender).trim();

  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 1000)) {
    return NextResponse.json({ error: "La edad debe ser un número entero válido." }, { status: 400 });
  }

  if (height !== null && (!Number.isInteger(height) || height <= 0 || height > 1000)) {
    return NextResponse.json({ error: "La altura debe ser un número entero en centímetros." }, { status: 400 });
  }

  if (gender !== null && gender.length > 50) {
    return NextResponse.json({ error: "El género es demasiado largo." }, { status: 400 });
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
