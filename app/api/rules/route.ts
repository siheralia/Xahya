import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type RuleRow = {
  id: number;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function GET() {
  const query = db.raw.sql`
    SELECT "id", "title", "content", "position", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "ruleSection"
    ORDER BY "position" ASC, "id" ASC
  `.returnsRow({
    id: "pg/int4@1",
    title: "pg/text@1",
    content: "pg/text@1",
    position: "pg/int4@1",
    createdAt: "pg/text@1",
    updatedAt: "pg/text@1",
  }).build();

  const rules = await db.runtime().query(query) as RuleRow[];
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title || title.length > 120) {
    return NextResponse.json({ error: "El título debe tener entre 1 y 120 caracteres." }, { status: 400 });
  }
  if (!content || content.length > 30000) {
    return NextResponse.json({ error: "Las reglas deben tener entre 1 y 30000 caracteres." }, { status: 400 });
  }

  const nextPositionQuery = db.raw.sql`
    SELECT COALESCE(MAX("position"), -1) + 1 AS "position"
    FROM "ruleSection"
  `.returnsRow({ position: "pg/int4@1" }).build();
  const [{ position }] = await db.runtime().query(nextPositionQuery) as Array<{ position: number }>;

  const query = db.raw.sql`
    INSERT INTO "ruleSection" ("title", "content", "position")
    VALUES (${title}, ${content}, ${position})
    RETURNING "id", "title", "content", "position", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
  `.returnsRow({
    id: "pg/int4@1",
    title: "pg/text@1",
    content: "pg/text@1",
    position: "pg/int4@1",
    createdAt: "pg/text@1",
    updatedAt: "pg/text@1",
  }).build();

  const [rule] = await db.runtime().query(query) as RuleRow[];
  return NextResponse.json({ rule }, { status: 201 });
}
