import { availableAttackSpeedStats, readDefaultAttackSpeedStat, writeDefaultAttackSpeedStat } from "@/lib/skills/speed-settings";
import { readDurationPricing, writeDurationPricing } from "@/lib/effects/duration-pricing-settings";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { EFFECT_CATALOG } from "@/lib/effects/catalog";
import { readManagedEffectCatalog, readMechanicalMetadata, writeMechanicalMetadata } from "@/lib/effects/managed-catalog";
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
  return NextResponse.json({ ...await readManagedEffectCatalog(), durationPricing: await readDurationPricing(), defaultAttackSpeedStat: await readDefaultAttackSpeedStat(), attackSpeedStats: await availableAttackSpeedStats() });
}

export async function PUT(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action === "default-attack-speed") {
    try {
      const before = await readDefaultAttackSpeedStat();
      await writeDefaultAttackSpeedStat(String(body.statKey ?? ""));
      await recordAuditEvent({ actorUserId: Number(user.id), action: "UPDATE_DEFAULT_ATTACK_SPEED", entityType: "SKILL_SETTINGS", details: { before, after: body.statKey } });
      return NextResponse.json({ defaultAttackSpeedStat: body.statKey });
    } catch { return NextResponse.json({ error: "Estadística de velocidad inválida." }, { status: 400 }); }
  }
  if (body?.action === "duration-pricing") {
    try {
      const before = await readDurationPricing();
      await writeDurationPricing(body.pricing);
      await recordAuditEvent({ actorUserId: Number(user.id), action: "UPDATE_DURATION_PRICING", entityType: "EFFECT_PRICING", details: { before, after: body.pricing } });
      return NextResponse.json({ durationPricing: body.pricing });
    } catch { return NextResponse.json({error:"Multiplicadores de duración inválidos."},{status:400}); }
  }
  const type = typeof body?.type === "string" ? body.type : "";
  if (body?.action === "metadata") {
    const entry = EFFECT_CATALOG.find(effect => effect.type === type);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!entry || !label || label.length > 100 || description.length > 2000) return NextResponse.json({ error: "Datos de efecto inválidos." }, { status: 400 });
    const metadata = await readMechanicalMetadata();
    const before = metadata[type] ?? { label: entry.label, description: "" };
    metadata[type] = { label, description };
    await writeMechanicalMetadata(metadata);
    await recordAuditEvent({ actorUserId: Number(user.id), action: "UPDATE_EFFECT_METADATA", entityType: "EFFECT", details: { type, before, after: metadata[type] } });
    return NextResponse.json({ metadata: metadata[type] });
  }
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
