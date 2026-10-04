import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function PUT(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];

  const query = db.raw.sql`SELECT "id" FROM "ruleSection" ORDER BY "position" ASC, "id" ASC`.returnsRow({ id: "pg/int4@1" }).build();
  const existing = await db.runtime().query(query) as Array<{ id: number }>;
  const existingIds = existing.map((row) => row.id);
  if (ids.length !== existingIds.length || ids.some((id: number, index: number) => id !== existingIds[index])) {
    return NextResponse.json({ error: "El orden recibido no coincide con las secciones actuales." }, { status: 400 });
  }

  for (let index = 0; index < ids.length; index++) {
    const update = db.raw.sql`UPDATE "ruleSection" SET "position" = ${index}, "updatedAt" = now() WHERE "id" = ${ids[index]}`.affectedCount().build();
    await db.runtime().execute(update);
  }

  return NextResponse.json({ ok: true });
}
