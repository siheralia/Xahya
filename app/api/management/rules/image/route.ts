import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const BUCKET = "rule-images";
const MAX_BYTES = 8 * 1024 * 1024;

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales de Supabase.");
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

function kind(value: FormDataEntryValue | string | null) {
  return value === "background" || value === "banner" ? value : null;
}

function ext(type: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[type] ?? null;
}

async function removeVariants(url: string, key: string, ruleId: number, imageKind: string) {
  const prefixes = ["jpg", "png", "webp", "gif"].map((extension) => `rules/${ruleId}/${imageKind}.${extension}`);
  await fetch(url + "/storage/v1/object/" + BUCKET, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes }),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const ruleId = Number(form.get("ruleId"));
  const imageKind = kind(form.get("kind"));
  if (!(file instanceof File) || !Number.isInteger(ruleId) || ruleId <= 0 || !imageKind) return NextResponse.json({ error: "Archivo, regla o tipo inválidos." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen debe pesar entre 1 B y 8 MB." }, { status: 400 });
  const extension = ext(String(file.type));
  if (!extension) return NextResponse.json({ error: "Solo se permiten imágenes JPG, PNG, WEBP o GIF." }, { status: 400 });

  const Rule = (db.orm.public as any).RuleSection;
  const rule = await Rule.where({ id: ruleId }).first();
  if (!rule) return NextResponse.json({ error: "Regla no encontrada." }, { status: 404 });

  const { url, key } = config();
  const path = `rules/${ruleId}/${imageKind}.${extension}`;
  await removeVariants(url, key, ruleId, imageKind);

  const upload = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": String(file.type), "x-upsert": "true", "cache-control": "31536000" },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store",
  });
  if (!upload.ok) return NextResponse.json({ error: "Supabase Storage rechazó la imagen (" + upload.status + ")." }, { status: 502 });

  const field = imageKind === "banner" ? "bannerPath" : "backgroundPath";
  const updated = await Rule.where({ id: ruleId }).update({ [field]: path });
  return NextResponse.json({ rule: updated });
}

export async function DELETE(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const ruleId = Number(url.searchParams.get("ruleId"));
  const imageKind = kind(url.searchParams.get("kind"));
  if (!Number.isInteger(ruleId) || ruleId <= 0 || !imageKind) return NextResponse.json({ error: "Regla o tipo inválidos." }, { status: 400 });

  const Rule = (db.orm.public as any).RuleSection;
  const rule = await Rule.where({ id: ruleId }).first();
  if (!rule) return NextResponse.json({ error: "Regla no encontrada." }, { status: 404 });

  const { url: storageUrl, key } = config();
  await removeVariants(storageUrl, key, ruleId, imageKind);
  const field = imageKind === "banner" ? "bannerPath" : "backgroundPath";
  await Rule.where({ id: ruleId }).update({ [field]: null });
  return NextResponse.json({ ok: true });
}
