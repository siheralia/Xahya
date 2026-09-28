import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);

  if (!currentUser || !["GM", "ADMIN"].includes(String(currentUser.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const characters = await db.orm.public.Character.all();

  return NextResponse.json(
    characters.map((character) => {
      const owner = users.find((user) => user.id === character.userId);

      return {
        id: character.id,
        name: character.name,
        ownerName: owner?.name ?? owner?.email ?? "Usuario desconocido",
      };
    }),
  );
}
