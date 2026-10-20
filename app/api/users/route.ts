import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.orm.public.User.all();

  return NextResponse.json(
    users.filter((user) => user.clerkId !== "SYSTEM"),
  );
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : null;

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const allUsers = await db.orm.public.User.all();
  const normalizedEmail = email.toLowerCase();
  const bannedEmail = allUsers.find(
    (user) => String(user.email).trim().toLowerCase() === normalizedEmail && String(user.role) === "BANNED",
  );
  if (bannedEmail) {
    return NextResponse.json({ error: "Esta cuenta está bloqueada." }, { status: 403 });
  }

  const existing = allUsers.find((user) => user.clerkId === clerkId);

  if (existing) {
    return NextResponse.json(existing);
  }

  const user = await db.orm.public.User.create({
    clerkId,
    email,
    name: name || null,
  });

  return NextResponse.json(user, { status: 201 });
}
