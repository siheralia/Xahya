import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { resolvePingPongAction, type CombatAttackType } from "@/lib/combat/engine";

const ATTACK_TYPES = new Set(["CUT", "BLUNT", "PIERCE"]);

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const CombatSession = (db.orm.public as any).CombatSession;
  const session = CombatSession ? await CombatSession.where({ id }).first() : null;
  if (!session) return NextResponse.json({ error: "Combate no encontrado." }, { status: 404 });

  const character = await db.orm.public.Character.where({ id: Number(session.playerCharacterId) }).first();
  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!character || (!management && Number(character.userId) !== Number(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ session });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const body = await request.json().catch(() => ({}));
  const playerAttackType = String(body?.attackType ?? "CUT").toUpperCase();
  if (!ATTACK_TYPES.has(playerAttackType)) {
    return NextResponse.json({ error: "Tipo de ataque inválido." }, { status: 400 });
  }

  const CombatSession = (db.orm.public as any).CombatSession;
  const session = CombatSession ? await CombatSession.where({ id }).first() : null;
  if (!session) return NextResponse.json({ error: "Combate no encontrado." }, { status: 404 });
  if (String(session.status) !== "ACTIVE") return NextResponse.json({ error: "El combate ya terminó." }, { status: 400 });

  const character = await db.orm.public.Character.where({ id: Number(session.playerCharacterId) }).first();
  const stats = await (db.orm.public as any).CharacterStat.where({ characterId: Number(session.playerCharacterId) }).first();
  if (!character || !stats) return NextResponse.json({ error: "Datos del personaje incompletos." }, { status: 400 });

  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const playerAgility = Math.max(1, Number(stats.agility ?? 1));
  const npcStats = session.npcStats && typeof session.npcStats === "object" ? session.npcStats as Record<string, unknown> : {};
  const npcAgility = Math.max(1, Number(npcStats.agility ?? npcStats.AGI ?? 1));
  const npcAttackType = ATTACK_TYPES.has(String(npcStats.attackType ?? "CUT").toUpperCase())
    ? String(npcStats.attackType ?? "CUT").toUpperCase() as CombatAttackType
    : "CUT";

  const result = resolvePingPongAction({
    currentTick: Number(session.currentTick ?? 0),
    turn: Number(session.turn ?? 1),
    playerAgility,
    npcAgility,
    playerAttackType: playerAttackType as CombatAttackType,
    npcAttackType,
    playerAction: String(body?.actionName ?? "Ataque"),
  });

  const updated = await CombatSession.where({ id }).update({
    currentTick: result.currentTick,
    turn: result.turn,
    activeActor: result.activeActor,
    playerNextActionTick: result.playerNextActionTick,
    npcNextActionTick: result.npcNextActionTick,
    lastAction: result.events,
    updatedAt: new Date(),
  });

  return NextResponse.json({ session: updated, events: result.events });
}
