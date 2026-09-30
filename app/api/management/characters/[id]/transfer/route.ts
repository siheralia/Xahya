import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);
  if (!currentUser || String(currentUser.role) !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const targetUserId = Number(body?.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) return NextResponse.json({ error: "Usuario destino inválido." }, { status: 400 });

  const character = (await db.orm.public.Character.all()).find((item) => Number(item.id) === characterId);
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  const targetUser = users.find((user) => Number(user.id) === targetUserId);
  if (!targetUser) return NextResponse.json({ error: "El usuario destino no es válido." }, { status: 400 });
  if (Number(character.userId) === targetUserId) return NextResponse.json({ error: "El personaje ya pertenece a ese usuario." }, { status: 400 });

  await db.orm.public.Character.where({ id: character.id }).update({ userId: targetUser.id });

  await recordAuditEvent({
    actorUserId: currentUser.id,
    action: "CHARACTER_TRANSFER",
    entityType: "CHARACTER",
    entityId: characterId,
    characterId,
    targetUserId: targetUser.id,
    details: { fromUserId: Number(character.userId), toUserId: targetUser.id, toUserName: targetUser.name ?? "Sin nombre" },
  });

  return NextResponse.json({ success: true, characterId, userId: targetUser.id, userName: targetUser.name ?? "Sin nombre" });
}
