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
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const businesses = await Business.all();
  const positions = await Position.all();
  const contracts = await Contract.all();
  const characters = await db.orm.public.Character.all();

  const activeStaff: any[] = [];

  async function addActiveStaff(position: any, business: any | null) {
    if (!position.active) return;
    const startTime = String(position.startTime);
    const endTime = String(position.endTime);
    if (!isOpen(startTime, endTime, nowMinutes)) return;

    const contract = contracts.find((entry: any) => {
      if (Number(entry.positionId) !== Number(position.id) || !entry.active) return false;

      // Employment dates are Temporal.Instant values in the ORM. Never pass
      // them to Date/relational operators because that triggers Temporal's
      // "Do not use built-in arithmetic operators..." error.
      const startDate = entry.startDate?.epochMilliseconds ?? Number.NEGATIVE_INFINITY;
      const endDate = entry.endDate?.epochMilliseconds ?? Number.POSITIVE_INFINITY;
      const now = Date.now();
      return startDate <= now && now < endDate;
    });
    if (!contract) return;

    const character = characters.find((entry: any) => Number(entry.id) === Number(contract.characterId));
    if (!character) return;

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
      businessId: business ? Number(business.id) : null,
      businessName: business ? String(business.name) : "Tienda del sistema",
      businessDescription: business ? business.description ?? null : "Tienda del sistema",
      positionId: Number(position.id),
      positionTitle: String(position.title),
      positionDescription: position.description ?? null,
      startTime,
      endTime,
      character: {
        id: Number(character.id),
        name: String(character.name),
        flair: character.flair ?? null,
        avatarUrl,
        themePalette: (character as any).themePalette ?? null,
      },
    });
  }

  // Only the system store's "Encargado de tienda" positions appear in the store.
  for (const position of positions.filter((entry: any) =>
    entry.businessId == null &&
    String(entry.title ?? "").trim().toLocaleLowerCase("es-MX") === "encargado de tienda"
  )) {
    await addActiveStaff(position, null);
  }

  // Business-owned positions keep their existing business association.
  for (const business of businesses) {
    if (!business.active) continue;
    for (const position of positions.filter((entry: any) => Number(entry.businessId) === Number(business.id))) {
      await addActiveStaff(position, business);
    }
  }

  return NextResponse.json({ timeZone: TIME_ZONE, localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, activeStaff });
  } catch (error) {
    console.error("STORE_ACTIVE_STAFF_ERROR", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el personal activo." },
      { status: 500 }
    );
  }
}
