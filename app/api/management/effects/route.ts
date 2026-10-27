import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EFFECT_CATALOG } from "@/lib/effects/catalog";
import { readEffectPricing, writeEffectPricing } from "@/lib/effects/pricing";
import { defaultEffectPricing, type EffectPricingMap } from "@/lib/skills/pch";

async function admin() {
  const { userId } = await auth();
  if (!userId) return null;
  const users = await db.orm.public.User.all();
  return users.find(u => u.clerkId === userId && String(u.role) === "ADMIN") ?? null;
}

export async function GET() {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pricing = { ...defaultEffectPricing(), ...await readEffectPricing() };
  return NextResponse.json({ effects: EFFECT_CATALOG, pricing });
}

export async function PUT(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const type = typeof body?.type === "string" ? body.type : "";
  const base = body?.base, step = body?.step, enabled = body?.enabled;
  if (!(type in defaultEffectPricing()) || !Number.isSafeInteger(base) || base < 0 || base > 100000 ||
      !Number.isSafeInteger(step) || step < 0 || step > 100000 || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Configuración inválida." }, { status: 400 });
  }
  const before: EffectPricingMap = { ...defaultEffectPricing(), ...await readEffectPricing() };
  const after: EffectPricingMap = { ...before, [type]: { base: Number(base), step: Number(step), enabled: Boolean(enabled) } };
  await writeEffectPricing(after);
  await recordAuditEvent({ actorUserId: Number(user.id), action: "UPDATE_EFFECT_PRICING", entityType: "EFFECT_PRICING", details: { type, before: before[type], after: after[type] } });
  return NextResponse.json({ pricing: after });
}
