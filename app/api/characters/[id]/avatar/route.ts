import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const BUCKET = "character-avatars";
const MAX_BYTES = 5 * 1024 * 1024;

async function getOwnedCharacter(id: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  if (!user) return { error: NextResponse.json({ error: "Xahya user not found" }, { status: 404 }) };
  const character = await db.orm.public.Character.where({ id }).first();
  if (!character) return { error: NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 }) };
  const isOwner = Number(character.userId) === Number(user.id);
  const isManager = ["GM", "ADMIN"].includes(String(user.role));
  if (!isOwner && !isManager) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { character, user };
}

function storageConfig() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  const result = await getOwnedCharacter(characterId);
  if ("error" in result) return result.error;
  try {
    const { url, key } = storageConfig();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
    if (file.type !== "image/webp") return NextResponse.json({ error: "La imagen debe llegar comprimida como WebP." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen comprimida no puede superar 5 MB." }, { status: 400 });

    const path = String(result.character.userId) + "/" + characterId + ".webp";
    const upload = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "image/webp", "x-upsert": "true", "cache-control": "31536000" },
      body: Buffer.from(await file.arrayBuffer()),
      cache: "no-store",
    });
    if (!upload.ok) return NextResponse.json({ error: "No se pudo guardar la imagen en Storage." }, { status: 502 });

    await db.orm.public.Character.where({ id: characterId }).update({ avatarPath: path } as any);
    const signed = await fetch(url + "/storage/v1/object/sign/" + BUCKET + "/" + path, {
      method: "POST", headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }), cache: "no-store",
    });
    if (!signed.ok) return NextResponse.json({ error: "La imagen se guardó, pero no se pudo generar su URL." }, { status: 502 });
    const signedData = await signed.json();
    return NextResponse.json({ avatarUrl: signedData.signedURL ? url + "/storage/v1" + signedData.signedURL : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el avatar." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  const result = await getOwnedCharacter(characterId);
  if ("error" in result) return result.error;
  try {
    const { url, key } = storageConfig();
    const path = (result.character as any).avatarPath ? String((result.character as any).avatarPath) : null;
    if (path) {
      const remove = await fetch(url + "/storage/v1/object/" + BUCKET, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
        cache: "no-store",
      });
      if (!remove.ok) return NextResponse.json({ error: "No se pudo eliminar la imagen del almacenamiento." }, { status: 502 });
    }
    await db.orm.public.Character.where({ id: characterId }).update({ avatarPath: null } as any);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el avatar." }, { status: 500 });
  }
}
