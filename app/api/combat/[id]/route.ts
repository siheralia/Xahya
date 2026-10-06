import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
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

  const previousTick = Number(session.currentTick ?? 0);
  const result = resolvePingPongAction({
    currentTick: previousTick,
    turn: Number(session.turn ?? 1),
    playerAgility,
    npcAgility,
    playerAttackType: playerAttackType as CombatAttackType,
    npcAttackType,
    playerAction: String(body?.actionName ?? "Ataque"),
  });

  const logicalTicksElapsed = Math.max(0, result.currentTick - previousTick);
  const now = Temporal.Now.instant();

  const { updated, skillAccumulations } = await db.transaction(async (tx) => {
    const TxSession = (tx.orm.public as any).CombatSession;
    const State = (tx.orm.public as any).CharacterSkillState;
    const Skill = (tx.orm.public as any).Skill;

    let skillAccumulations: Array<{ skillId: number; added: number; ticks: number }> = [];
    if (State && Skill && logicalTicksElapsed > 0) {
      const states = await State.where({ characterId: Number(session.playerCharacterId), active: true }).all();
      const skills = await Skill.where({ characterId: Number(session.playerCharacterId) }).all();
      for (const state of states) {
        const skill = skills.find((candidate: any) => Number(candidate.id) === Number(state.skillId));
        if (!skill || String(skill.status) !== "APPROVED") continue;
        const perTick = Math.max(0, Number(skill.accumulationPerTick ?? 0));
        if (perTick <= 0) continue;
        const added = logicalTicksElapsed * perTick;
        await State.where({ id: Number(state.id) }).update({
          accumulations: Number(state.accumulations ?? 0) + added,
          totalTicks: Number(state.totalTicks ?? 0) + logicalTicksElapsed,
          updatedAt: now,
        });
        skillAccumulations.push({ skillId: Number(state.skillId), added, ticks: logicalTicksElapsed });
      }
    }

    const updated = await TxSession.where({ id }).update({
      currentTick: result.currentTick,
      turn: result.turn,
      activeActor: result.activeActor,
      playerNextActionTick: result.playerNextActionTick,
      npcNextActionTick: result.npcNextActionTick,
      lastAction: result.events,
      updatedAt: now,
    });
    return { updated, skillAccumulations };
  });

  return NextResponse.json({ session: updated, events: result.events, logicalTicksElapsed, skillAccumulations });
}
