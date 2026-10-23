import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { mechanicOptions, readMechanics, writeMechanics, type MechanicKey } from "@/lib/stats/mechanics";

async function getAdmin() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = (await db.orm.public.User.all()).find((entry) => entry.clerkId === userId);
  return user && String(user.role) === "ADMIN" ? user : null;
}
export async function GET() {
  if (!await getAdmin()) return NextResponse.json({ error: "Solo ADMIN puede configurar estas mecánicas." }, { status: 403 });
  return NextResponse.json({ mechanics: await readMechanics(), options: await mechanicOptions() });
}
export async function PUT(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const input = body?.mechanics;
  const keys: MechanicKey[] = ["mazeStealth", "mazeDetection", "casinoInfluence", "blackjackInfluence", "mazeRoomGeneration", "mazeItemChance", "mazeTreasureMoney", "combatSpeed"];
  if (!input || keys.some((key) => typeof input[key] !== "string")) return NextResponse.json({ error: "Configuración incompleta." }, { status: 400 });
  try {
    const before = await readMechanics();
    const next = Object.fromEntries(keys.map((key) => [key, input[key]])) as Record<MechanicKey, string>;
    await writeMechanics(next);
    await recordAuditEvent({ actorUserId: admin.id, action: "STAT_MECHANICS_CONFIG", entityType: "SYSTEM", entityId: null, details: { before, after: next } });
    return NextResponse.json({ mechanics: next });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}
