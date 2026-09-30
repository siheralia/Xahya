import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const STAT_KEYS = ["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"] as const;
const CASINO_ACTIONS = new Set(["CASINO_ROULETTE","CASINO_DICE","CASINO_BLACKJACK"]);

function parseDetails(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.orm.public.User.all();
  const currentUser = users.find((user) => user.clerkId === clerkId);
  if (!currentUser || !["GM","ADMIN"].includes(String(currentUser.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const characters = await db.orm.public.Character.all();
  const resources = await db.orm.public.CharacterResource.all();
  const stats = await db.orm.public.CharacterStat.all();
  const auditLogs = await db.orm.public.AuditLog.all();

  const rows = characters.flatMap((character) => {
    const owner = users.find((user) => Number(user.id) === Number(character.userId));
    if (String(owner?.role) === "SYSTEM") return [];

    const resource = resources.find((r) => Number(r.characterId) === Number(character.id));
    const stat = stats.find((s) => Number(s.characterId) === Number(character.id));
    const pointsTotal = STAT_KEYS.reduce((sum, key) => sum + Number((stat as Record<string, unknown> | null)?.[key] ?? 0), 0);

    let casinoWon = 0;
    let casinoSpent = 0;
    let mazeMoney = 0;
    let mazeRooms = 0;
    let mazeDiscovered = 0;
    let mazeTreasures = 0;
    for (const log of auditLogs) {
      if (Number(log.characterId) !== Number(character.id)) continue;
      const action = String(log.action);
      const details = parseDetails(log.details);
      if (CASINO_ACTIONS.has(action)) {
        const bet = Number(details.bet ?? 0);
        if (Number.isFinite(bet) && bet > 0) casinoSpent += bet;
        const payout = Number(details.payout ?? 0);
        if (Number.isFinite(payout) && payout > 0) casinoWon += payout;
      }
      if (action === "MAZE_EXPLORE") {
        mazeRooms++;
        if (details.generated === true) mazeDiscovered++;
      }
      if (action === "MAZE_TREASURE_CLAIM") {
        const money = Number(details.money ?? 0);
        if (Number.isFinite(money) && money > 0) mazeMoney += money;
        mazeTreasures++;
      }
    }

    return [{
      id: Number(character.id),
      name: character.name,
      money: Number(resource?.money ?? 0),
      karma: Number(resource?.karma ?? 0),
      levelUpPoints: Number(resource?.levelUpPoints ?? 0),
      pointsTotal,
      luck: Number(stat?.luck ?? 0),
      hp: 10 + Number(stat?.constitution ?? 0) * 2,
      mana: 5 + Number(stat?.intelligence ?? 0) + Number(stat?.spirit ?? 0),
      casinoWon,
      casinoSpent,
      mazeMoney,
      mazeRooms,
      mazeDiscovered,
      mazeTreasures,
    }];
  });

  return NextResponse.json({ rankings: rows });
}
