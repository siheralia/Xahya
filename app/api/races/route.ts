import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveRaces } from "@/lib/races";
import { getRaceImageUrl } from "@/lib/race-image";

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const races = await getActiveRaces(db);
  const racesWithImages = await Promise.all(
    races.map(async (race: any) => ({
      ...race,
      imageUrl: await getRaceImageUrl(race.imagePath),
    })),
  );

  return NextResponse.json({ races: racesWithImages });
}
