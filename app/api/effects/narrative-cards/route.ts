import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readNarrativeEffectCards, writeNarrativeEffectCards } from "@/lib/effects/narrative-cards";

async function currentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return (await db.orm.public.User.all()).find(u => u.clerkId === userId) ?? null;
}
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cards = await readNarrativeEffectCards();
  return NextResponse.json({ cards: String(user.role) === "ADMIN" ? cards : cards.filter(c => c.enabled) });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || String(user.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "Narrativo";
  const icon = typeof body?.icon === "string" ? body.icon.trim() : "sparkles";
  const pch = body?.pch;
  if (!name || name.length > 100 || !description || description.length > 2000 || category.length > 40 || icon.length > 40 || !Number.isSafeInteger(pch) || pch < 0 || pch > 100000)
    return NextResponse.json({ error: "Datos de efecto inválidos." }, { status: 400 });
  const cards = await readNarrativeEffectCards();
  if (cards.length >= 500) return NextResponse.json({ error: "Límite de tarjetas alcanzado." }, { status: 400 });
  const card = { id: crypto.randomUUID(), name, description, category, icon, pch, enabled: true };
  await writeNarrativeEffectCards([...cards, card]);
  return NextResponse.json({ card }, { status: 201 });
}
