import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const Race = (db.orm.public as any).Race;
  const RacePerk = (db.orm.public as any).RacePerk;
  const Perk = (db.orm.public as any).Perk;
  const [races, links, perks] = await Promise.all([Race.all(), RacePerk.all(), Perk.where({ active: true }).all()]);

  return NextResponse.json({
    races: races.map((race: any) => ({
      ...race,
      perkIds: links.filter((link: any) => Number(link.raceId) === Number(race.id)).map((link: any) => Number(link.perkId)),
    })),
    perks,
  });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const imagePath = typeof body?.imagePath === "string" ? body.imagePath.trim() : null;
  const perkIds = Array.isArray(body?.perkIds) ? [...new Set(body.perkIds.map(Number).filter(Number.isInteger))] : [];

  if (!name || name.length > 100) return NextResponse.json({ error: "El nombre es obligatorio y no puede superar 100 caracteres." }, { status: 400 });

  const Race = (db.orm.public as any).Race;
  const RacePerk = (db.orm.public as any).RacePerk;
  const Perk = (db.orm.public as any).Perk;
  const validPerks = await Perk.where({ active: true }).all();
  const validIds = new Set(validPerks.map((perk: any) => Number(perk.id)));
  if (perkIds.some((id: number) => !validIds.has(id))) {
    return NextResponse.json({ error: "Una o más perks no son válidas." }, { status: 400 });
  }

  try {
    const race = await db.transaction(async (tx) => {
      const created = await (tx.orm.public as any).Race.create({
        name,
        description: description || null,
        imagePath: imagePath || null,
        active: true,
      });
      const RP = (tx.orm.public as any).RacePerk;
      for (const perkId of perkIds) await RP.create({ raceId: Number(created.id), perkId });
      return created;
    });
    return NextResponse.json(race, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear la raza. Verifica que el nombre no esté repetido." }, { status: 409 });
  }
}
