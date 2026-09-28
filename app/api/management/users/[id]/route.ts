import { auth, clerkClient } from "@clerk/nextjs/server";
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

  await db.orm.public.User
    .where({ id: targetUser.id })
    .update({ role });

  return NextResponse.json({ success: true, role });
}

// DELETE: transfiere los personajes al usuario SYSTEM, elimina el usuario de Xahya y después elimina su cuenta de Clerk.
export async function DELETE(
  _request: Request,
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

  if (Number(targetUser.id) === Number(currentUser.id)) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propio usuario." },
      { status: 400 },
    );
  }

  if (String(targetUser.role) === "SYSTEM" || targetUser.clerkId === "SYSTEM") {
    return NextResponse.json(
      { error: "El usuario SYSTEM no se puede eliminar." },
      { status: 400 },
    );
  }

  const systemUser = users.find(
    (user) => user.clerkId === "SYSTEM" && String(user.role) === "SYSTEM",
  );

  if (!systemUser) {
    return NextResponse.json(
      { error: "No existe el usuario SYSTEM. No se puede eliminar este usuario de forma segura." },
      { status: 500 },
    );
  }

  const characters = await db.orm.public.Character.all();
  const ownedCharacters = characters.filter(
    (character) => Number(character.userId) === Number(targetUser.id),
  );

  try {
    await db.transaction(async (tx) => {
      await tx.orm.public.Character
        .where({ userId: targetUser.id })
        .updateAll({ userId: systemUser.id });

      await tx.orm.public.User
        .where({ id: targetUser.id })
        .delete();
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la transferencia y eliminación del usuario." },
      { status: 500 },
    );
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(String(targetUser.clerkId));
  } catch {
    return NextResponse.json(
      {
        success: true,
        warning:
          "El usuario fue eliminado de Xahya y sus personajes pasaron a Sistema, pero no se pudo eliminar su cuenta de Clerk.",
      },
    );
  }

  return NextResponse.json({
    success: true,
    transferredCharacters: ownedCharacters.length,
  });
}
