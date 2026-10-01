import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteEnemyImage, getEnemyImageUrl, getDefaultEnemyImageUrl, setEnemyImagePath, uploadEnemyImage } from "@/lib/enemy-image";

const MAX_BYTES = 5 * 1024 * 1024;

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((u) => u.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const enemyId = Number(form.get("enemyId") ?? 0);
  const isDefault = String(form.get("default") ?? "") === "true";
  if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  if (!isDefault && (!Number.isInteger(enemyId) || enemyId <= 0)) return NextResponse.json({ error: "Enemigo inválido." }, { status: 400 });
  if (file.type !== "image/webp") return NextResponse.json({ error: "La imagen debe llegar comprimida como WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen no puede superar 5 MB." }, { status: 400 });

  try {
    const path = isDefault ? "default.webp" : "enemies/" + enemyId + ".webp";
    if (!isDefault) {
      const enemy = await (db.orm.public as any).Enemy.where({ id: enemyId }).first();
      if (!enemy) return NextResponse.json({ error: "Enemigo no encontrado." }, { status: 404 });
      await uploadEnemyImage(path, file);
      await setEnemyImagePath(enemyId,path);
    } else {
      await uploadEnemyImage(path, file);
      // La imagen genérica siempre usa la ruta fija default.webp.
    }
    return NextResponse.json({ imageUrl: await getEnemyImageUrl(path), path });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir la imagen." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const enemyId = Number(body?.enemyId ?? 0);
  const isDefault = Boolean(body?.default);
  try {
    if (isDefault) {
      await deleteEnemyImage("default.webp");
    } else {
      const Enemy = (db.orm.public as any).Enemy;
      const enemy = await Enemy.where({ id: enemyId }).first();
      if (!enemy) return NextResponse.json({ error: "Enemigo no encontrado." }, { status: 404 });
      const { getEnemyImagePaths } = await import("@/lib/enemy-image");
      const paths = await getEnemyImagePaths([enemyId]);
      await deleteEnemyImage(paths.get(enemyId));
      await setEnemyImagePath(enemyId,null);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar la imagen." }, { status: 500 });
  }
}
