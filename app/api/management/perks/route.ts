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

export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const Perk = (db.orm.public as any).Perk;
  const CharacterPerk = (db.orm.public as any).CharacterPerk;
  const perks = await Perk.all();
  const assignments = CharacterPerk ? await CharacterPerk.all() : [];
  return NextResponse.json({
    perks: perks.map((perk:any) => ({
      ...perk,
      assignedCount: assignments.filter((entry:any) => Number(entry.perkId) === Number(perk.id)).length,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const probability = Number(body?.probability);
  const effects = Array.isArray(body?.effects) ? body.effects : [];
  const stackable = body?.stackable !== false;
  const validCombatTypes = ["IGNORE_PHYS_DEF_MULTIPLIER","IGNORE_PHYS_DEF_BONUS","IGNORE_MAGIC_DEF_MULTIPLIER","IGNORE_MAGIC_DEF_BONUS","IGNORE_ALL_DEF_MULTIPLIER","IGNORE_ALL_DEF_BONUS","FINAL_DAMAGE_MULTIPLIER","FINAL_DAMAGE_BONUS"];
  if (effects.some((e:any) => !e || typeof e.type !== "string" || (!["STAT_BONUS","STAT_MULTIPLIER","RESOURCE_BONUS","COMBAT_MULTIPLIER","EQUIPMENT_SLOT_CAP"].includes(e.type) && !validCombatTypes.includes(e.type)) || !Number.isFinite(Number(e.value)))) return NextResponse.json({ error: "Efecto de perk inválido." }, { status: 400 });
  const maxStacks = body?.maxStacks == null || body.maxStacks === "" ? null : Math.max(1, Math.trunc(Number(body.maxStacks)));
  if (!name || name.length > 100) return NextResponse.json({ error: "El nombre es obligatorio y no puede superar 100 caracteres." }, { status: 400 });
  if (!Number.isFinite(probability) || probability < 0) return NextResponse.json({ error: "La probabilidad debe ser un número mayor o igual a 0." }, { status: 400 });
  const Perk = (db.orm.public as any).Perk;
  const perk = await Perk.create({ name, description: description || null, probability, effects, stackable, maxStacks, active: true });
  return NextResponse.json(perk, { status: 201 });
}
