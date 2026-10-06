import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { advanceCharacterSkillTicks } from "@/lib/combat/ticks";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "tick");
  const Skill = (db.orm.public as any).Skill;
  const State = (db.orm.public as any).CharacterSkillState;
  if (!Skill || !State) return NextResponse.json({ error: "El sistema de ticks aún no está disponible." }, { status: 500 });

  if (action === "start" || action === "stop") {
    const skillId = Number(body?.skillId);
    const skill = await Skill.where({ id: skillId, characterId }).first();
    if (!skill || String(skill.status) !== "APPROVED") return NextResponse.json({ error: "Habilidad no encontrada o no aprobada." }, { status: 404 });
    const now = new Date();
    const existing = await State.where({ characterId, skillId }).first();
    const state = existing
      ? await State.where({ id: Number(existing.id) }).update({ active: action === "start", lastTickAt: action === "start" ? now : existing.lastTickAt, updatedAt: now })
      : await State.create({ characterId, skillId, active: action === "start", accumulations: 0, totalTicks: 0, lastTickAt: action === "start" ? now : null });
    return NextResponse.json({ state });
  }

  const result = await db.transaction((tx) => advanceCharacterSkillTicks(tx, characterId));
  const states = await State.where({ characterId }).all();
  return NextResponse.json({ states, advanced: result });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const State = (db.orm.public as any).CharacterSkillState;
  const states = State ? await State.where({ characterId }).all() : [];
  return NextResponse.json({ states });
}
