import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveMobileEnemies } from "@/lib/maze-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });

  const result = await db.transaction(async (tx) => {
    return await moveMobileEnemies(tx);
  });

  return NextResponse.json({ ok: true, ...result });
}
