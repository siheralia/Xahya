import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const users = await db.orm.public.User.all();

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();

  const user = await db.orm.public.User.create({
    email: body.email,
    name: body.name,
  });

  return NextResponse.json(user, { status: 201 });
}