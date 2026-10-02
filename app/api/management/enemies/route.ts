import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultEnemyImageUrl, getEnemyImagePaths, getEnemyImageUrl } from "@/lib/enemy-image";

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
    const EnemyTheme = (db.orm.public as any).EnemyTheme;
    const Theme = (db.orm.public as any).Theme;
    const links = EnemyTheme ? await EnemyTheme.all() : [];
    const themes = Theme ? await Theme.all() : [];
    const paths = await getEnemyImagePaths(enemies.map((enemy:any)=>Number(enemy.id)));
    const defaultImageUrl = await getDefaultEnemyImageUrl();
    const withImages = await Promise.all(enemies.map(async (enemy:any) => ({
      ...enemy,
      themeIds: links.filter((link:any)=>Number(link.enemyId)===Number(enemy.id)).map((link:any)=>Number(link.themeId)),
      themes: links.filter((link:any)=>Number(link.enemyId)===Number(enemy.id)).map((link:any)=>themes.find((theme:any)=>Number(theme.id)===Number(link.themeId))).filter(Boolean),
      imageUrl: await getEnemyImageUrl(paths.get(Number(enemy.id)))
    })));
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
  const capturability = Math.max(0, Math.floor(Number(body?.capturability) || 0));
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
      capturability,
    });
    const themeIds = Array.isArray(body?.themeIds) ? [...new Set(body.themeIds.map((id:any)=>Number(id)).filter((id:number)=>Number.isInteger(id)&&id>0))] : [];
    const Theme = (db.orm.public as any).Theme;
    const EnemyTheme = (db.orm.public as any).EnemyTheme;
    if (Theme && EnemyTheme && themeIds.length) {
      const themes = await Theme.all();
      for (const themeId of themeIds) if (themes.some((theme:any)=>Number(theme.id)===themeId && Boolean(theme.active))) await EnemyTheme.create({enemyId:enemy.id,themeId});
    }
    return NextResponse.json(enemy, { status: 201 });
  } catch (error) {
    console.error("ENEMY_CREATE_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el enemigo." }, { status: 500 });
  }
}
