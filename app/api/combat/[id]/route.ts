import { readMechanics, getCharacterMechanicValue } from "@/lib/stats/mechanics";
import { getEffectiveCharacterStats } from "@/lib/stats/effective";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { canApproveCombat } from "@/lib/combat/permissions";
import { resolvePingPongAction, type CombatAttackType } from "@/lib/combat/engine";
import { advanceCombatMechanics, encounterAgilityMultiplier } from "@/lib/skills/mechanics-runtime";

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
  const management = await canApproveCombat(user);
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
  if ((session.lastAction as any)?.combatV1) return NextResponse.json({ error: "Este combate utiliza acciones y reacciones del motor nuevo. Usa /api/combat/"+id+"/actions." }, { status: 409 });

  const character = await db.orm.public.Character.where({ id: Number(session.playerCharacterId) }).first();
  const stats = await getEffectiveCharacterStats(Number(session.playerCharacterId));
  if (!character || !stats) return NextResponse.json({ error: "Datos del personaje incompletos." }, { status: 400 });

  const management = await canApproveCombat(user);
  if (!management && Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mechanics = await readMechanics();
  // Character effective stats already include their active mechanic status multipliers.
  const playerAgility = Math.max(1, await getCharacterMechanicValue(Number(session.playerCharacterId), mechanics.combatSpeed));
  const npcStats = session.npcStats && typeof session.npcStats === "object" ? session.npcStats as Record<string, unknown> : {};
  const npcAgility = Math.max(1, Math.round(Number(npcStats[mechanics.combatSpeed] ?? (mechanics.combatSpeed === "agility" ? npcStats.AGI : undefined) ?? npcStats.agility ?? npcStats.AGI ?? 1) * encounterAgilityMultiplier(session.mechanicsState,"NPC")));
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

  const { updated, skillAccumulations, environment } = await db.transaction(async (tx) => {
    // Serialize against skill activation, which stamps its cooldown on this
    // encounter. Reload environment after the lock to avoid overwriting a
    // newly recorded cooldown with a stale pre-transaction session snapshot.
    const lock=db.raw.sql`UPDATE public."character" SET id=id WHERE id=${Number(session.playerCharacterId)}`.affectedCount().build();
    if((await tx.execute(lock)).affectedRows!==1)throw new Error("CHARACTER_NOT_FOUND");
    const TxSession = (tx.orm.public as any).CombatSession;
    const freshEncounter=await TxSession.where({id}).first();
    if(!freshEncounter||String(freshEncounter.status)!=="ACTIVE")throw new Error("ENCOUNTER_NOT_ACTIVE");
    const State = (tx.orm.public as any).CharacterSkillState;
    const Skill = (tx.orm.public as any).Skill;

    let skillAccumulations: Array<{ skillId: number; added: number; ticks: number }> = [];
    const turnSkills=Skill?await Skill.where({characterId:Number(session.playerCharacterId)}).all():[];
    const activeStates=State?await State.where({characterId:Number(session.playerCharacterId),active:true}).all():[];
    const activeIds=activeStates.map((row:any)=>Number(row.skillId));
    const environment=advanceCombatMechanics(freshEncounter.mechanicsState,Number(session.playerCharacterId),turnSkills,activeIds);
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

    // Each combat turn advances temporary copies once; status gates their use after expiration.
    const turnsElapsed = Math.max(0, Number(result.turn) - Number(session.turn ?? 1));
    if (turnsElapsed > 0) {
      const progress = db.raw.sql`
        UPDATE public."skillCopy" SET "remainingTurns"=GREATEST(0,"remainingTurns"-${turnsElapsed})
        WHERE "characterId"=${Number(session.playerCharacterId)} AND mode='TEMPORARY' AND "remainingTurns">0
      `.affectedCount().build();
      await tx.execute(progress);
      const expire = db.raw.sql`
        UPDATE public."skill" SET status='EXPIRED'
        WHERE "characterId"=${Number(session.playerCharacterId)} AND status='APPROVED'
          AND id IN (SELECT "copiedSkillId" FROM public."skillCopy"
          WHERE "characterId"=${Number(session.playerCharacterId)} AND mode='TEMPORARY' AND "remainingTurns"=0)
      `.affectedCount().build();
      await tx.execute(expire);

      // Expire thefts against the thief's combat turns. Original skill rows stay intact.
      const decrementThefts=db.raw.sql`
        UPDATE public."skillTheft" SET
          "remainingTurns"=GREATEST(0,"remainingTurns"-${turnsElapsed}),
          status=CASE WHEN "remainingTurns"<=${turnsElapsed} THEN 'EXPIRED' ELSE 'ACTIVE' END,
          "expiredAt"=CASE WHEN "remainingTurns"<=${turnsElapsed} THEN now() ELSE "expiredAt" END
        WHERE "thiefCharacterId"=${Number(session.playerCharacterId)}
          AND status='ACTIVE'
      `.affectedCount().build();
      await tx.execute(decrementThefts);
      const expireStolenSkills=db.raw.sql`
        UPDATE public."skill" SET status='EXPIRED'
        WHERE "characterId"=${Number(session.playerCharacterId)} AND status='APPROVED'
          AND id IN (SELECT "stolenSkillId" FROM public."skillTheft"
            WHERE "thiefCharacterId"=${Number(session.playerCharacterId)} AND status='EXPIRED')
      `.affectedCount().build();
      await tx.execute(expireStolenSkills);
    }

    const updated = await TxSession.where({ id }).update({
      currentTick: result.currentTick,
      turn: result.turn,
      activeActor: result.activeActor,
      playerNextActionTick: result.playerNextActionTick,
      npcNextActionTick: result.npcNextActionTick,
      lastAction: result.events,
      mechanicsState:environment,
      updatedAt: now,
    });
    return { updated, skillAccumulations, environment };
  });

  return NextResponse.json({ session: updated, events: result.events, logicalTicksElapsed, skillAccumulations, environment });
}
