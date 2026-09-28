import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);

  if (!currentUser || String(currentUser.role) !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const characterId = Number(id);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido" }, { status: 400 });
  }

  const character = await db.orm.public.Character
    .where({ id: characterId })
    .first();

  if (!character) {
    return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.orm.public.CharacterModifier
      .where({ characterId })
      .delete();

    const stats = await tx.orm.public.CharacterStat
      .where({ characterId })
      .first();

    if (stats) {
      await tx.orm.public.CharacterStat
        .where({ id: stats.id })
        .delete();
    }

    const resources = await tx.orm.public.CharacterResource
      .where({ characterId })
      .first();

    if (resources) {
      await tx.orm.public.CharacterResource
        .where({ id: resources.id })
        .delete();
    }

    await tx.orm.public.Character
      .where({ id: characterId })
      .delete();
  });

  return NextResponse.json({ success: true });
}
