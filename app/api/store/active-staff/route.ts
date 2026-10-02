import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { localParts, minutes, TIME_ZONE } from "@/lib/economy";

function isOpen(start: string, end: string, nowMinutes: number) {
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  if (startMinutes === null || endMinutes === null) return false;
  if (startMinutes <= endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export async function GET() {
  const p = localParts();
  const nowMinutes = p.hour * 60 + p.minute;
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const businesses = await Business.all();
  const positions = await Position.all();
  const contracts = await Contract.all();
  const characters = await db.orm.public.Character.all();

  const activeStaff = [];

  for (const business of businesses) {
    if (!business.active) continue;
    for (const position of positions.filter((entry: any) => Number(entry.businessId) === Number(business.id) && entry.active)) {
      if (!isOpen(String(position.startTime), String(position.endTime), nowMinutes)) continue;
      const contract = contracts.find((entry: any) => Number(entry.positionId) === Number(position.id) && entry.active);
      if (!contract) continue;
      const character = characters.find((entry: any) => Number(entry.id) === Number(contract.characterId));
      if (!character) continue;

      let avatarUrl: string | null = null;
      const avatarPath = (character as any).avatarPath ? String((character as any).avatarPath) : null;
      if (avatarPath && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const signedResponse = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/sign/character-avatars/" + avatarPath, {
          method: "POST",
          headers: { Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: 1800 }),
          cache: "no-store",
        });
        if (signedResponse.ok) {
          const signed = await signedResponse.json();
          avatarUrl = signed.signedURL ? process.env.SUPABASE_URL + "/storage/v1" + signed.signedURL : null;
        }
      }

      activeStaff.push({
        businessId: Number(business.id),
        businessName: String(business.name),
        businessDescription: business.description ?? null,
        positionId: Number(position.id),
        positionTitle: String(position.title),
        positionDescription: position.description ?? null,
        startTime: String(position.startTime),
        endTime: String(position.endTime),
        character: {
          id: Number(character.id),
          name: String(character.name),
          flair: character.flair ?? null,
          avatarUrl,
          themePalette: (character as any).themePalette ?? null,
        },
      });
    }
  }

  return NextResponse.json({ timeZone: TIME_ZONE, localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, activeStaff });
}
