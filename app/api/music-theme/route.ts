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
  try {
    const body: unknown = JSON.parse(text);
    const score = parseOrbitalScore(body);
    // Only this authenticated profile is writable; no mutation to combat mechanics.
    await db.orm.public.User.where({ id: user.id }).update({ musicTheme: score });
    return NextResponse.json({ theme: score });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error && /partitura|circunferencia|archivo|parámetros/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo guardar el tema personal" }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await db.orm.public.User.where({ id: user.id }).update({ musicTheme: null });
  return NextResponse.json({ theme: null });
}
