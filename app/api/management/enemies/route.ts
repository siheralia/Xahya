import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnemyImageUrl } from "@/lib/enemy-image";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((u) => u.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function GET() {
  const user = await getManager();
  if (!user) return NextResponse.json({ error: "Solo GM y ADMIN pueden gestionar enemigos." }, { status: 403 });
  try {
    const Enemy = (db.orm.public as any).Enemy;
    const enemies = await Enemy.all();
    const Setting = (db.orm.public as any).AppSetting;
    const setting = await Setting.where({ key: "enemy_default_image_path" }).first();
    const defaultImageUrl = await getEnemyImageUrl(setting?.value ? String(setting.value) : null);
    const withImages = await Promise.all(enemies.map(async (enemy:any) => ({ ...enemy, imageUrl: await getEnemyImageUrl(enemy.imagePath ?? null) })));
    return NextResponse.json({ enemies: withImages, defaultImageUrl });
  } catch (error) {
    console.error("ENEMY_LIST_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el catálogo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getManager();
  if (!user) return NextResponse.json({ error: "Solo GM y ADMIN pueden crear enemigos." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "El enemigo necesita un nombre." }, { status: 400 });

  const rank = ["NORMAL", "ELITE", "BOSS"].includes(String(body?.rank)) ? String(body.rank) : "NORMAL";
  const encounterWeight = Math.max(1, Number(body?.encounterWeight) || 1);
  const Enemy = (db.orm.public as any).Enemy;

  try {
    const enemy = await Enemy.create({
      name,
      description: String(body?.description ?? "").trim() || null,
      rank,
      stats: body?.stats && typeof body.stats === "object" ? body.stats : {},
      abilities: Array.isArray(body?.abilities) ? body.abilities : [],
      loot: Array.isArray(body?.loot) ? body.loot : [],
      encounterWeight,
      isBoss: Boolean(body?.isBoss) || rank === "BOSS",
      active: true,
      imagePath: null,
    });
    return NextResponse.json(enemy, { status: 201 });
  } catch (error) {
    console.error("ENEMY_CREATE_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el enemigo." }, { status: 500 });
  }
}
