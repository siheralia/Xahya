import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const characterId = Number(body?.characterId);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const CombatSession = (db.orm.public as any).CombatSession;
  if (!CombatSession) return NextResponse.json({ error: "El sistema de combate aún no está disponible." }, { status: 500 });

  const npcName = String(body?.npcName ?? "NPC").trim() || "NPC";
  const npcStats = body?.npcStats && typeof body.npcStats === "object" ? body.npcStats : {};
  const session = await CombatSession.create({
    playerCharacterId: characterId,
    npcName,
    npcStats,
    currentTick: 0,
    turn: 1,
    activeActor: "PLAYER",
    playerNextActionTick: 0,
    npcNextActionTick: null,
    status: "ACTIVE",
    lastAction: {},
  });

  return NextResponse.json({ session });
}
