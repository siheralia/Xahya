import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseOrbitalScore } from "@/lib/orbital-score.mjs";

/** The theme belongs to the Clerk-authenticated user, not a client-provided user ID. */
async function currentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.orm.public.User.where({ clerkId }).first();
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const theme = user.musicTheme ? parseOrbitalScore(user.musicTheme) : null;
    return NextResponse.json({ theme });
  } catch {
    return NextResponse.json({ error: "El tema guardado no es válido" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const text = await request.text();
  if (text.length > 36000) return NextResponse.json({ error: "Partitura demasiado grande" }, { status: 413 });
  let score;
  try {
    const body: unknown = JSON.parse(text);
    score = parseOrbitalScore(body);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Partitura JSON inválida",
    }, { status: 400 });
  }
  try {
    // The ORM JSON codec accepts JSON-shaped data; a validated score is serialized to that shape.
    await db.orm.public.User.where({ id: user.id }).update({ musicTheme: JSON.parse(JSON.stringify(score)) });
    return NextResponse.json({ theme: score });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el tema personal" }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await db.orm.public.User.where({ id: user.id }).update({ musicTheme: null });
  return NextResponse.json({ theme: null });
}
