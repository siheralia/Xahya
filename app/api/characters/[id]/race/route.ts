import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { syncCharacterRacePerks } from "@/lib/races";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return selectRace(request, context, false);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return selectRace(request, context, true);
}

async function selectRace(request: Request, context: { params: Promise<{ id: string }> }, managementOnly: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const characterId = Number(id);
  const body = await request.json().catch(() => null);
  const raceId = Number(body?.raceId);
  if (!Number.isInteger(characterId) || !Number.isInteger(raceId)) {
    return NextResponse.json({ error: "Personaje o raza inválidos." }, { status: 400 });
  }

  const Character = db.orm.public.Character;
  const character = await Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const isManagement = ["GM", "ADMIN"].includes(String(user.role));
  if (managementOnly && !isManagement) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!managementOnly && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!managementOnly && character.raceId != null) return NextResponse.json({ error: "La raza de este personaje ya fue elegida." }, { status: 409 });

  const Race = (db.orm.public as any).Race;
  const race = await Race.where({ id: raceId, active: true }).first();
  if (!race) return NextResponse.json({ error: "Raza no encontrada." }, { status: 404 });

  const previousRaceId = character.raceId == null ? null : Number(character.raceId);
  const updated = await db.transaction(async (tx) => syncCharacterRacePerks(tx, characterId, raceId));

  await recordAuditEvent({
    actorUserId: user.id,
    action: managementOnly ? "CHARACTER_RACE_CHANGED" : "CHARACTER_RACE_SELECTED",
    entityType: "RACE",
    entityId: raceId,
    characterId,
    details: { previousRaceId, raceId, source: managementOnly ? "MANAGEMENT" : "CHARACTER" },
  });

  return NextResponse.json({ success: true, character: updated, raceId });
}
