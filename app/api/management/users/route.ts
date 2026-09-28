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

  if (!currentUser || String(currentUser.role) !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const characters = await db.orm.public.Character.all();

  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      name: user.name ?? "Sin nombre",
      email: user.email,
      role: user.role,
      characters: characters
        .filter((character) => character.userId === user.id)
        .map((character) => ({
          id: character.id,
          name: character.name,
        })),
    })),
  );
}
