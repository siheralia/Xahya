import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceCharacterSkillTicks } from "@/lib/combat/ticks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const State = (db.orm.public as any).CharacterSkillState;
  if (!State) return NextResponse.json({ processed: 0, error: "Skill tick state unavailable" }, { status: 500 });
  const activeStates = await State.where({ active: true }).all();
  const characterIds = [...new Set(activeStates.map((state: any) => Number(state.characterId)))];
  let processed = 0;
  for (const characterId of characterIds) {
    const result = await db.transaction((tx) => advanceCharacterSkillTicks(tx, characterId));
    processed += result.length;
  }
  return NextResponse.json({ processed, characters: characterIds.length, at: new Date().toISOString() });
}
