import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const characterId = Number(id);
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return NextResponse.json({ error: "Xahya user not found" }, { status: 404 });
  if (!["GM","ADMIN"].includes(String(user.role))) {
    return NextResponse.json({ error: "Solo GM o ADMIN pueden modificar las estadísticas base" }, { status: 403 });
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });

  const body = await request.json();
  const statNames = ["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"] as const;
  for (const stat of statNames) {
    if (typeof body[stat] !== "number" || !Number.isFinite(body[stat])) {
      return NextResponse.json({ error: `El stat ${stat} debe ser un número válido` }, { status: 400 });
    }
  }

  const stats = await db.orm.public.CharacterStat.where({ characterId }).first();
  if (!stats) return NextResponse.json({ error: "Stats del personaje no encontrados" }, { status: 404 });

  const updatedStats = await db.orm.public.CharacterStat.where({ id: stats.id }).update({
    strength: body.strength, agility: body.agility, constitution: body.constitution, intelligence: body.intelligence,
    wisdom: body.wisdom, charisma: body.charisma, spirit: body.spirit, luck: body.luck,
  });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "STAT_UPDATE",
    entityType: "CHARACTER",
    entityId: characterId,
    characterId,
    details: {
      before: Object.fromEntries(statNames.map((stat) => [stat, Number(stats[stat])])),
      after: Object.fromEntries(statNames.map((stat) => [stat, body[stat]])),
    },
  });

  return NextResponse.json(updatedStats);
}
