import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
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

  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Usuario inválido." }, { status: 400 });
  }

  const targetUser = users.find((user) => Number(user.id) === userId);
  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role;

  if (role !== "PLAYER" && role !== "GM") {
    return NextResponse.json(
      { error: "El rol debe ser PLAYER o GM." },
      { status: 400 },
    );
  }

  if (Number(targetUser.id) === Number(currentUser.id)) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol desde aquí." },
      { status: 400 },
    );
  }

  await db.orm.public.User.update({
    where: { id: targetUser.id },
    data: { role },
  });

  return NextResponse.json({ success: true, role });
}
