import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { getCustomBasicDefinitions, getCharacterCustomBasicStats, syncCharacterCoreBasicStats } from "@/lib/stats/dynamic";

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

  const customDefinitions = await getCustomBasicDefinitions();
  const requestedCustom = body.customStats && typeof body.customStats === "object" ? body.customStats : {};
  const invalidCustomKey = Object.keys(requestedCustom).find((key) =>
    !customDefinitions.some((definition) => definition.key === key) ||
    typeof requestedCustom[key] !== "number" || !Number.isInteger(requestedCustom[key]) || !Number.isFinite(requestedCustom[key])
  );
  if (invalidCustomKey) return NextResponse.json({ error: "La estadística básica personalizada «" + invalidCustomKey + "» no es válida." }, { status: 400 });
  const updatedStats = await db.transaction(async (tx) => {
    const currentStats = await tx.orm.public.CharacterStat.where({ characterId }).first();
    if (!currentStats) throw new Error("Stats del personaje no encontrados");
    const nextCore = Object.fromEntries(statNames.map((stat) => [stat, body[stat]])) as Record<string, number>;
    const updated = await tx.orm.public.CharacterStat.where({ id: currentStats.id }).update(nextCore);
    await syncCharacterCoreBasicStats(characterId, nextCore, tx);

    const Dynamic = (tx.orm.public as any).CharacterStatValue;
    const previousCustom = await getCharacterCustomBasicStats(characterId, tx);
    for (const definition of customDefinitions) {
      if (!Object.prototype.hasOwnProperty.call(requestedCustom, definition.key)) continue;
      const row = previousCustom.rows.find((entry: any) => String(entry.statKey) === definition.key);
      if (row) await Dynamic.where({ id: Number(row.id) }).update({ value: requestedCustom[definition.key] });
      else await Dynamic.create({ characterId, statKey: definition.key, value: requestedCustom[definition.key] });
    }
    return updated;
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
      customStats: requestedCustom,
    },
  });

  return NextResponse.json(updatedStats);
}
