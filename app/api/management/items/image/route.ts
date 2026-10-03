import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const BUCKET = "item-images";
const MAX_BYTES = 5 * 1024 * 1024;

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((u) => u.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales de Supabase.");
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  const itemId = Number(form.get("itemId"));
  if (!(file instanceof File) || !Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: "Archivo u objeto inválidos." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen debe pesar entre 1 B y 5 MB." }, { status: 400 });
  if (!String(file.type).startsWith("image/")) return NextResponse.json({ error: "Solo se permiten imágenes." }, { status: 400 });

  const Item = (db.orm.public as any).Item;
  const item = await Item.where({ id: itemId }).first();
  if (!item) return NextResponse.json({ error: "Objeto no encontrado." }, { status: 404 });

  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[String(file.type)] ?? "webp";
  const path = "items/" + itemId + "." + ext;
  const { url, key } = config();
  const upload = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": String(file.type), "x-upsert": "true", "cache-control": "31536000" },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store",
  });
  if (!upload.ok) return NextResponse.json({ error: "Supabase Storage rechazó la imagen (" + upload.status + ")." }, { status: 502 });

  const updated = await Item.where({ id: itemId }).update({ imagePath: path });
  const signed = await fetch(url + "/storage/v1/object/sign/" + BUCKET + "/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });
  const data = await signed.json().catch(() => null);
  return NextResponse.json({ item: updated, imageUrl: data?.signedURL ? url + "/storage/v1" + data.signedURL : null });
}