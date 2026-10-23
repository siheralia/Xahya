import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const integer = (v: unknown) => typeof v === "number" && Number.isInteger(v);

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Inicia sesión para tirar dados." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  const sides = body.sides;
  const count = body.count;
  const modifier = body.modifier;
  const chance = body.chance;
  const min = body.min;
  const max = body.max;
  const characterId = body.characterId;
  const mode = body.mode;
  if (!integer(sides) || !SIDES.includes(sides as number) ||
      !integer(count) || (count as number) < 1 || (count as number) > 20 ||
      !integer(modifier) || Math.abs(modifier as number) > 1000 ||
      !integer(min) || !integer(max) || (min as number) < 0 || (max as number) > 100 || (min as number) > (max as number) ||
      !integer(chance) || (chance as number) < 0 || (chance as number) > 100 ||
      !["free", "probability"].includes(String(mode)) ||
      (characterId !== null && characterId !== undefined && (!integer(characterId) || (characterId as number) <= 0))) {
    return NextResponse.json({ error: "Parámetros de tirada inválidos." }, { status: 400 });
  }
  if (mode === "probability" && (sides !== 100 || count !== 1 || modifier !== 0)) {
    return NextResponse.json({ error: "Las pruebas porcentuales utilizan 1d100 sin modificador." }, { status: 400 });
  }
  const users = await db.orm.public.User.all();
  const user = users.find(u => u.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  let selectedCharacter: number | null = null;
  if (characterId !== null && characterId !== undefined) {
    const character = await db.orm.public.Character.where({ id: characterId as number }).first();
    if (!character || (Number(character.userId) !== Number(user.id) && !["GM", "ADMIN"].includes(String(user.role)))) {
      return NextResponse.json({ error: "Personaje no autorizado." }, { status: 403 });
    }
    selectedCharacter = Number(character.id);
  }
  const rolls = Array.from({ length: count as number }, () => randomInt(1, (sides as number) + 1));
  const total = rolls.reduce((sum, n) => sum + n, modifier as number);
  const effectiveChance = Math.max(min as number, Math.min(max as number, chance as number));
  const success = mode === "probability" ? rolls[0] <= effectiveChance : null;
  try {
    await recordAuditEvent({
      actorUserId: Number(user.id), action: "DICE_ROLL", entityType: "DICE",
      characterId: selectedCharacter,
      details: { mode, sides, count, modifier, rolls, total, chance, min, max, effectiveChance, success }
    });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar la tirada en el auditor." }, { status: 500 });
  }
  return NextResponse.json({ rolls, total, effectiveChance, success });
}
