import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type ThemePalette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
};

async function getAccessibleCharacter(id: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return { error: NextResponse.json({ error: "Xahya user not found" }, { status: 404 }) };

  const character = await db.orm.public.Character.where({ id }).first();
  if (!character) return { error: NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 }) };

  const allowed = Number(character.userId) === Number(user.id) || ["GM", "ADMIN"].includes(String(user.role));
  if (!allowed) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { character };
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  }

  const result = await getAccessibleCharacter(characterId);
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => null);
  const palette = body?.palette as Partial<ThemePalette> | undefined;
  if (!palette || !["primary", "secondary", "accent", "background", "surface", "border", "foreground", "muted"].every((key) => isHex(palette[key as keyof ThemePalette]))) {
    return NextResponse.json({ error: "Paleta inválida." }, { status: 400 });
  }

  const normalized: ThemePalette = {
    primary: palette.primary!,
    secondary: palette.secondary!,
    accent: palette.accent!,
    background: palette.background!,
    surface: palette.surface!,
    border: palette.border!,
    foreground: palette.foreground!,
    muted: palette.muted!,
  };

  await db.orm.public.Character.where({ id: characterId }).update({ themePalette: normalized } as any);
  return NextResponse.json({ themePalette: normalized });
}
