import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readStatisticsCatalog } from "@/lib/stats/dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db.orm.public.User.all();
  const user = users.find((entry) => entry.clerkId === userId);
  if (!user || !["ADMIN", "GM"].includes(String(user.role))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const statistics = (await readStatisticsCatalog()).filter((stat) => stat.active !== false);
  return NextResponse.json({ statistics });
}
