import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { CASINO_SETS, getCasinoExpectedReturn, getCasinoSet } from "@/lib/casino";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

async function getActiveSet() {
  const logs = await db.orm.public.AuditLog.where({ action: "CASINO_CONFIG" }).all();
  const latest = logs
    .map((log) => {
      try {
        return {
          createdAt: String(log.createdAt),
          details: typeof log.details === "string" ? JSON.parse(log.details) : (log.details ?? {}),
        };
      } catch {
        return { createdAt: String(log.createdAt), details: {} };
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return getCasinoSet(latest?.details?.setId);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(user.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const activeSet = await getActiveSet();

  return NextResponse.json({
    activeSetId: activeSet.id,
    sets: CASINO_SETS.map((set) => ({
      id: set.id,
      name: set.name,
      description: set.description,
      houseEdgeLabel: set.houseEdgeLabel,
      expectedReturn: getCasinoExpectedReturn(set),
      segments: set.segments,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(user.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const setId = String(body?.setId ?? "");
  const selected = CASINO_SETS.find((set) => set.id === setId);

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
    },
  });

  return NextResponse.json({ ok: true, activeSetId: selected.id });
}
