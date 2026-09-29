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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  const Perk = (db.orm.public as any).Perk;
  const perk = await Perk.where({ id }).first();
  if (!perk) return NextResponse.json({ error: "Perk no encontrado." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const data:any = {};
  if (typeof body?.name === "string") data.name = body.name.trim();
  if (typeof body?.description === "string" || body?.description === null) data.description = body.description?.trim() || null;
  if (body?.probability !== undefined) {
    const probability = Number(body.probability);
    if (!Number.isFinite(probability) || probability < 0) return NextResponse.json({ error: "Probabilidad inválida." }, { status: 400 });
    data.probability = probability;
  }
  if (Array.isArray(body?.effects)) data.effects = body.effects;
  if (typeof body?.stackable === "boolean") data.stackable = body.stackable;
  if (body?.maxStacks !== undefined) data.maxStacks = body.maxStacks == null || body.maxStacks === "" ? null : Math.max(1, Math.trunc(Number(body.maxStacks)));
  if (typeof body?.active === "boolean") data.active = body.active;
  const updated = await Perk.where({ id }).update(data);
  return NextResponse.json(updated);
}
