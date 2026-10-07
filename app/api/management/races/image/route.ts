import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteRaceImage, getRaceImageUrl, uploadRaceImage } from "@/lib/race-image";

const MAX_BYTES = 5 * 1024 * 1024;

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && ["GM", "ADMIN"].includes(String(user.role)) ? user : null;
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const raceId = Number(form.get("raceId") ?? 0);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  }
  if (!Number.isInteger(raceId) || raceId <= 0) {
    return NextResponse.json({ error: "Raza inválida." }, { status: 400 });
  }
  if (file.type !== "image/webp") {
    return NextResponse.json({ error: "La imagen debe llegar comprimida como WebP." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen no puede superar 5 MB." }, { status: 400 });
  }

  try {
    const Race = (db.orm.public as any).Race;
    const race = await Race.where({ id: raceId }).first();
    if (!race) return NextResponse.json({ error: "Raza no encontrada." }, { status: 404 });

    const path = "races/" + raceId + ".webp";
    await uploadRaceImage(path, file);
    await Race.where({ id: raceId }).update({ imagePath: path });

    return NextResponse.json({ imageUrl: await getRaceImageUrl(path), path });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir la imagen." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const raceId = Number(body?.raceId ?? 0);

  try {
    const Race = (db.orm.public as any).Race;
    const race = await Race.where({ id: raceId }).first();
    if (!race) return NextResponse.json({ error: "Raza no encontrada." }, { status: 404 });

    await deleteRaceImage(race.imagePath);
    await Race.where({ id: raceId }).update({ imagePath: null });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar la imagen." },
      { status: 500 },
    );
  }
}
