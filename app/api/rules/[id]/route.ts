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

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Regla inválida." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title || title.length > 120) {
    return NextResponse.json({ error: "El título debe tener entre 1 y 120 caracteres." }, { status: 400 });
  }
  if (!content || content.length > 30000) {
    return NextResponse.json({ error: "Las reglas deben tener entre 1 y 30000 caracteres." }, { status: 400 });
  }

  const query = db.raw.sql`
    UPDATE "ruleSection"
    SET "title" = ${title}, "content" = ${content}, "updatedAt" = now()
    WHERE "id" = ${id}
    RETURNING "id", "title", "content", "position", "backgroundPath", "bannerPath", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
  `.returnsRow({
    id: "pg/int4@1",
    title: "pg/text@1",
    content: "pg/text@1",
    position: "pg/int4@1",
    backgroundPath: "pg/text@1",
    bannerPath: "pg/text@1",
    createdAt: "pg/text@1",
    updatedAt: "pg/text@1",
  }).build();

  const rows = await db.runtime().query(query);
  if (!rows.length) return NextResponse.json({ error: "Regla no encontrada." }, { status: 404 });
  return NextResponse.json({ rule: rows[0] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Regla inválida." }, { status: 400 });

  const query = db.raw.sql`
    DELETE FROM "ruleSection"
    WHERE "id" = ${id}
  `.affectedCount().build();

  const result = await db.runtime().execute(query);
  if (!result.affectedRows) return NextResponse.json({ error: "Regla no encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
