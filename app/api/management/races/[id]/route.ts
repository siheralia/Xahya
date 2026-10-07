import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const raceId = Number(id);
  const body = await request.json().catch(() => null);
  if (!Number.isInteger(raceId)) return NextResponse.json({ error: "Raza inválida." }, { status: 400 });

  const Race = (db.orm.public as any).Race;
  const RacePerk = (db.orm.public as any).RacePerk;
  const Perk = (db.orm.public as any).Perk;
  const race = await Race.where({ id: raceId }).first();
  if (!race) return NextResponse.json({ error: "Raza no encontrada." }, { status: 404 });

  const updates: any = {};
  if (body && Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
    updates.name = name;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "description")) updates.description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (body && Object.prototype.hasOwnProperty.call(body, "imagePath")) updates.imagePath = typeof body.imagePath === "string" ? body.imagePath.trim() || null : null;
  if (body && Object.prototype.hasOwnProperty.call(body, "active")) updates.active = Boolean(body.active);

  const hasPerkIds = body && Object.prototype.hasOwnProperty.call(body, "perkIds");
  let perkIds: number[] = [];
  if (hasPerkIds) {
    perkIds = Array.isArray(body.perkIds) ? [...new Set(body.perkIds.map(Number).filter(Number.isInteger))] : [];
    const validPerks = await Perk.where({ active: true }).all();
    const validIds = new Set(validPerks.map((perk: any) => Number(perk.id)));
    if (perkIds.some((perkId) => !validIds.has(perkId))) return NextResponse.json({ error: "Una o más perks no son válidas." }, { status: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      if (Object.keys(updates).length) await (tx.orm.public as any).Race.where({ id: raceId }).update(updates);
      if (hasPerkIds) {
        const RP = (tx.orm.public as any).RacePerk;
        const existing = await RP.where({ raceId }).all();
        const wanted = new Set(perkIds);
        for (const link of existing) if (!wanted.has(Number(link.perkId))) await RP.where({ raceId, perkId: Number(link.perkId) }).delete();
        const existingIds = new Set(existing.map((link: any) => Number(link.perkId)));
        for (const perkId of perkIds) if (!existingIds.has(perkId)) await RP.create({ raceId, perkId });
      }
    });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la raza." }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
