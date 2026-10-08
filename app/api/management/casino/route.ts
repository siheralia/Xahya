import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { CASINO_SETS, getCasinoExpectedReturn, type CasinoSet } from "@/lib/casino";
import { getActiveCasinoSet, getAllCasinoSets, getCasinoSchedules, validateCasinoSchedules } from "@/lib/casino-schedule";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(user.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [sets, schedules, active] = await Promise.all([getAllCasinoSets(), getCasinoSchedules(), getActiveCasinoSet()]);
  const activeSet = active.set;

  return NextResponse.json({
    activeSetId: activeSet.id,
    schedules,
    activeScheduleId: active.schedule?.id ?? null,
    sets: sets.map((set) => ({
      id: set.id,
      name: set.name,
      description: set.description,
      houseEdgeLabel: set.houseEdgeLabel,
      expectedReturn: getCasinoExpectedReturn(set),
      segments: set.segments,
      builtIn: CASINO_SETS.some((base) => base.id === set.id),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(user.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "activate");

  if (action === "activate") {
    const setId = String(body?.setId ?? "");
    const sets = await getAllCasinoSets();
    const selected = sets.find((set) => set.id === setId);

    if (!selected) {
      return NextResponse.json({ error: "Set de casino inválido." }, { status: 400 });
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "CASINO_CONFIG",
      entityType: "CASINO",
      entityId: 1,
      details: {
        setId: selected.id,
        setName: selected.name,
        expectedReturn: getCasinoExpectedReturn(selected),
        set: selected,
      },
    });

    return NextResponse.json({ ok: true, activeSetId: selected.id });
  }

  if (action === "scheduleSave") {
    const sets = await getAllCasinoSets();
    const parsed = validateCasinoSchedules(body?.schedules, new Set(sets.map((set) => set.id)));
    if (parsed.error || !parsed.schedules) {
      return NextResponse.json({ error: parsed.error ?? "Programación inválida." }, { status: 400 });
    }
    await recordAuditEvent({
      actorUserId: user.id,
      action: "CASINO_SCHEDULE_CONFIG",
      entityType: "CASINO",
      entityId: 1,
      details: { schedules: parsed.schedules },
    });
    const active = await getActiveCasinoSet();
    return NextResponse.json({ ok: true, schedules: parsed.schedules, activeSetId: active.set.id, activeScheduleId: active.schedule?.id ?? null });
  }

  if (action === "save") {
    const input = body?.set;
    const id = String(input?.id ?? "").trim();
    const name = String(input?.name ?? "").trim();
    const description = String(input?.description ?? "").trim();
    const houseEdgeLabel = String(input?.houseEdgeLabel ?? "").trim();
    const rawSegments = Array.isArray(input?.segments) ? input.segments : [];

    if (!id || !name || !rawSegments.length) {
      return NextResponse.json({ error: "El set necesita ID, nombre y al menos un segmento." }, { status: 400 });
    }

    const segments = rawSegments.map((segment: any) => ({
      label: String(segment?.label ?? "").trim(),
      weight: Number(segment?.weight),
      multiplier: Number(segment?.multiplier),
      color: String(segment?.color ?? "").trim(),
    }));

    if (segments.some((segment: any) => !segment.label || !Number.isFinite(segment.weight) || segment.weight <= 0 || !Number.isFinite(segment.multiplier) || !/^#[0-9a-fA-F]{6}$/.test(segment.color))) {
      return NextResponse.json({ error: "Cada segmento necesita etiqueta, peso > 0, multiplicador válido y color HEX (#RRGGBB)." }, { status: 400 });
    }

    const set: CasinoSet = {
      id,
      name,
      description,
      houseEdgeLabel: houseEdgeLabel || "Calculado automáticamente",
      segments,
    };

    await recordAuditEvent({
      actorUserId: user.id,
      action: "CASINO_SET",
      entityType: "CASINO",
      entityId: 1,
      details: { set },
    });

    return NextResponse.json({
      ok: true,
      set: { ...set, expectedReturn: getCasinoExpectedReturn(set), builtIn: CASINO_SETS.some((base) => base.id === id) },
    });
  }

  if (action === "delete") {
    const setId = String(body?.setId ?? "").trim();
    if (CASINO_SETS.some((set) => set.id === setId)) {
      return NextResponse.json({ error: "Los sets predeterminados no se eliminan." }, { status: 400 });
    }

    const sets = await getAllCasinoSets();
    const schedules = await getCasinoSchedules();
    if (schedules.some((schedule) => schedule.setId === setId)) {
      return NextResponse.json({ error: "No puedes eliminar un set que aparece en la programación. Quita primero sus horarios." }, { status: 400 });
    }
    if (!sets.some((set) => set.id === setId)) {
      return NextResponse.json({ error: "Set no encontrado." }, { status: 404 });
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "CASINO_SET_DELETE",
      entityType: "CASINO",
      entityId: 1,
      details: { setId },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
