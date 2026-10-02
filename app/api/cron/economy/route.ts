import { NextRequest, NextResponse } from "next/server";
import { processEconomyPayments } from "@/lib/economy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await processEconomyPayments();
  return NextResponse.json({ ok: true, ...result });
}
