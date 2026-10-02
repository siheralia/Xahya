import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Temporal } from "@js-temporal/polyfill";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Character = db.orm.public.Character;
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Relationship = (db.orm.public as any).CharacterRelationship;
  const [characters, businesses, positions, contracts, relationships] = await Promise.all([
    Character.all(), Business.all(), Position.all(), Contract.all(), Relationship.all(),
  ]);

  const owned = characters.filter((character: any) => Number(character.userId) === Number(user.id));
  const ownedIds = new Set(owned.map((character: any) => Number(character.id)));
  const ownedBusinesses = businesses.filter((business: any) => ownedIds.has(Number(business.ownerCharacterId)));
  const knownByOwner = new Set(
    relationships.filter((row: any) => ownedIds.has(Number(row.characterId))).map((row: any) => Number(row.knownCharacterId)),
  );

  return NextResponse.json({
    businesses: ownedBusinesses.map((business: any) => ({
      id: Number(business.id),
      name: String(business.name),
      description: business.description ?? null,
      ownerCharacterId: Number(business.ownerCharacterId),
      ownerCharacter: owned.find((character: any) => Number(character.id) === Number(business.ownerCharacterId)) ?? null,
      passiveIncome: Number(business.passiveIncome ?? 0),
      passiveFrequency: String(business.passiveFrequency ?? "WEEKLY"),
      balance: Number(business.balance ?? 0),
      positions: positions.filter((position: any) => Number(position.businessId) === Number(business.id) && position.active).map((position: any) => ({
        id: Number(position.id), title: String(position.title), description: position.description ?? null,
        startTime: String(position.startTime), endTime: String(position.endTime), salary: Number(position.salary),
        salaryFrequency: String(position.salaryFrequency),
        contracts: contracts.filter((contract: any) => Number(contract.positionId) === Number(position.id) && contract.active).map((contract: any) => ({
          id: Number(contract.id),
          character: characters.find((character: any) => Number(character.id) === Number(contract.characterId)) ?? null,
        })),
      })),
    })),
    candidates: characters.filter((character: any) => knownByOwner.has(Number(character.id)) && !ownedIds.has(Number(character.id))).map((character: any) => ({
      id: Number(character.id), name: String(character.name), flair: character.flair ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (action !== "hire" && action !== "fire") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  const businessId = Number(body?.businessId);
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Character = db.orm.public.Character;
  const Relationship = (db.orm.public as any).CharacterRelationship;

  const business = await Business.where({ id: businessId }).first();
  if (!business) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
  const owner = await Character.where({ id: Number(business.ownerCharacterId) }).first();
  if (!owner || Number(owner.userId) !== Number(user.id)) return NextResponse.json({ error: "Solo el dueño puede administrar empleados de este negocio." }, { status: 403 });

  if (action === "hire") {
    const positionId = Number(body?.positionId);
    const characterId = Number(body?.characterId);
    const position = await Position.where({ id: positionId }).first();
    const character = await Character.where({ id: characterId }).first();
    if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "La plaza no pertenece a este negocio." }, { status: 400 });
    if (!position.active) return NextResponse.json({ error: "Esta plaza no está activa." }, { status: 400 });
    if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

    const known = await Relationship.where({ characterId: Number(owner.id), knownCharacterId: characterId }).first();
    if (!known) return NextResponse.json({ error: "Solo puedes contratar personajes que tu dueño conoce." }, { status: 403 });

    const current = (await Contract.where({ positionId }).all()).find((contract: any) => contract.active);
    if (current) return NextResponse.json({ error: "Ese turno ya tiene una persona contratada." }, { status: 400 });
    const characterEmployment = (await Contract.where({ characterId }).all()).find((contract: any) => contract.active);
    if (characterEmployment) return NextResponse.json({ error: "Ese personaje ya tiene un empleo activo." }, { status: 400 });

    const contract = await Contract.create({ positionId, characterId, startDate: Temporal.Instant.fromEpochMilliseconds(Date.now()), endDate: null, active: true });
    return NextResponse.json({ contract }, { status: 201 });
  }

  const contractId = Number(body?.contractId);
  const contract = await Contract.where({ id: contractId }).first();
  if (!contract) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
  const position = await Position.where({ id: Number(contract.positionId) }).first();
  if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "Ese contrato no pertenece a este negocio." }, { status: 403 });
  await Contract.where({ id: contractId }).update({ active: false, endDate: Temporal.Instant.fromEpochMilliseconds(Date.now()) });
  return NextResponse.json({ success: true });
}
