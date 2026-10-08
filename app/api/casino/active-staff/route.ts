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
  try {
    const p = localParts();
    const nowMinutes = p.hour * 60 + p.minute;
    const Position = (db.orm.public as any).BusinessPosition;
    const Contract = (db.orm.public as any).EmploymentContract;
    const [positions, contracts, characters] = await Promise.all([
      Position.all(), Contract.all(), db.orm.public.Character.all(),
    ]);
    const position = positions.find((entry: any) =>
      entry.businessId == null &&
      entry.active &&
      String(entry.title ?? "").trim().toLocaleLowerCase("es-MX") === "encargado de casino" &&
      isOpen(String(entry.startTime), String(entry.endTime), nowMinutes),
    );
    if (!position) return NextResponse.json({ timeZone: TIME_ZONE, activeStaff: null });

    const now = Date.now();
    const contract = contracts.find((entry: any) => {
      if (Number(entry.positionId) !== Number(position.id) || !entry.active) return false;
      const startDate = entry.startDate?.epochMilliseconds ?? Number.NEGATIVE_INFINITY;
      const endDate = entry.endDate?.epochMilliseconds ?? Number.POSITIVE_INFINITY;
      return startDate <= now && now < endDate;
    });
    if (!contract) return NextResponse.json({ timeZone: TIME_ZONE, activeStaff: null });

    const character = characters.find((entry: any) => Number(entry.id) === Number(contract.characterId));
    if (!character) return NextResponse.json({ timeZone: TIME_ZONE, activeStaff: null });

    let avatarUrl: string | null = null;
    const avatarPath = (character as any).avatarPath ? String((character as any).avatarPath) : null;
    if (avatarPath && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const response = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/sign/character-avatars/" + avatarPath, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 1800 }),
        cache: "no-store",
      });
      if (response.ok) {
        const signed = await response.json();
        avatarUrl = signed.signedURL ? process.env.SUPABASE_URL + "/storage/v1" + signed.signedURL : null;
      }
    }

    return NextResponse.json({
      timeZone: TIME_ZONE,
      activeStaff: {
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
      },
    });
  } catch (error) {
    console.error("CASINO_ACTIVE_STAFF_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el personal activo." }, { status: 500 });
  }
}
