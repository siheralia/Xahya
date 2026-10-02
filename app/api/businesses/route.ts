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

async function getOwnedBusiness(user: any, businessId: number) {
  const Business = (db.orm.public as any).Business;
  const Character = db.orm.public.Character;
  const business = await Business.where({ id: businessId }).first();
  if (!business) return { error: NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 }) };
  const owner = await Character.where({ id: Number(business.ownerCharacterId) }).first();
  if (!owner || Number(owner.userId) !== Number(user.id)) return { error: NextResponse.json({ error: "Solo el dueño puede administrar este negocio." }, { status: 403 }) };
  return { business, owner };
}

function validTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) <= 23 && Number(value.slice(3, 5)) <= 59;
}

const frequencies = ["DAILY", "WEEKLY"];

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Character = db.orm.public.Character;
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Relationship = (db.orm.public as any).CharacterRelationship;
  const [characters, businesses, positions, contracts, relationships] = await Promise.all([Character.all(), Business.all(), Position.all(), Contract.all(), Relationship.all()]);
  const owned = characters.filter((character: any) => Number(character.userId) === Number(user.id));
  const ownedIds = new Set(owned.map((character: any) => Number(character.id)));
  const ownedBusinesses = businesses.filter((business: any) => ownedIds.has(Number(business.ownerCharacterId)));
  const knownByOwner = new Set(relationships.filter((row: any) => ownedIds.has(Number(row.characterId))).map((row: any) => Number(row.knownCharacterId)));

  return NextResponse.json({
    businesses: ownedBusinesses.map((business: any) => ({
      id: Number(business.id), name: String(business.name), description: business.description ?? null,
      ownerCharacterId: Number(business.ownerCharacterId),
      ownerCharacter: owned.find((character: any) => Number(character.id) === Number(business.ownerCharacterId)) ?? null,
      passiveIncome: Number(business.passiveIncome ?? 0), passiveFrequency: String(business.passiveFrequency ?? "WEEKLY"), balance: Number(business.balance ?? 0),
      positions: positions.filter((p: any) => Number(p.businessId) === Number(business.id) && p.active).map((p: any) => ({
        id: Number(p.id), title: String(p.title), description: p.description ?? null, startTime: String(p.startTime), endTime: String(p.endTime),
        salary: Number(p.salary), salaryFrequency: String(p.salaryFrequency), salaryDayOfWeek: Number(p.salaryDayOfWeek ?? 0),
        payerType: String(p.payerType ?? "SYSTEM"), payerCharacterId: p.payerCharacterId == null ? null : Number(p.payerCharacterId),
        contracts: contracts.filter((c: any) => Number(c.positionId) === Number(p.id) && c.active).map((c: any) => ({ id: Number(c.id), character: characters.find((ch: any) => Number(ch.id) === Number(c.characterId)) ?? null })),
      })),
    })),
    candidates: characters.filter((c: any) => knownByOwner.has(Number(c.id)) && !ownedIds.has(Number(c.id))).map((c: any) => ({ id: Number(c.id), name: String(c.name), flair: c.flair ?? null })),
  });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Character = db.orm.public.Character;
  const Relationship = (db.orm.public as any).CharacterRelationship;

  if (action === "createPosition" || action === "updatePosition") {
    const businessId = Number(body?.businessId);
    if (!Number.isInteger(businessId) || businessId <= 0) return NextResponse.json({ error: "Negocio inválido." }, { status: 400 });
    const owned = await getOwnedBusiness(user, businessId);
    if (owned.error) return owned.error;

    const title = String(body?.title ?? "").trim();
    const startTime = String(body?.startTime ?? "");
    const endTime = String(body?.endTime ?? "");
    const salary = Math.trunc(Number(body?.salary ?? 0));
    const salaryFrequency = String(body?.salaryFrequency ?? "DAILY");
    const salaryDayOfWeek = Math.trunc(Number(body?.salaryDayOfWeek ?? 0));
    const payerType = String(body?.payerType ?? "SYSTEM");
    const payerCharacterId = payerType === "CHARACTER" ? Number(body?.payerCharacterId) : null;

    if (!title || title.length > 100 || !validTime(startTime) || !validTime(endTime) || salary < 0 || !frequencies.includes(salaryFrequency)) return NextResponse.json({ error: "Datos del puesto inválidos." }, { status: 400 });
    if (!["SYSTEM", "CHARACTER"].includes(payerType)) return NextResponse.json({ error: "Pagador inválido." }, { status: 400 });
    if (salaryFrequency === "WEEKLY" && (salaryDayOfWeek < 0 || salaryDayOfWeek > 6)) return NextResponse.json({ error: "Día de pago inválido." }, { status: 400 });

    if (payerType === "CHARACTER") {
      const payer = await Character.where({ id: payerCharacterId }).first();
      if (!payer) return NextResponse.json({ error: "El personaje pagador no existe." }, { status: 404 });
      if (Number(payer.id) !== Number(owned.owner.id)) {
        const known = await Relationship.where({ characterId: Number(owned.owner.id), knownCharacterId: payerCharacterId }).first();
        if (!known) return NextResponse.json({ error: "Solo puedes elegir como pagador al dueño o a un personaje que conozca." }, { status: 403 });
      }
    }

    if (action === "createPosition") {
      const position = await Position.create({ businessId, title, description: typeof body?.description === "string" ? body.description.trim() || null : null, startTime, endTime, salary, salaryFrequency, salaryDayOfWeek, payerType, payerCharacterId, active: true });
      return NextResponse.json({ position }, { status: 201 });
    }

    const positionId = Number(body?.positionId);
    const position = await Position.where({ id: positionId }).first();
    if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "El puesto no pertenece a este negocio." }, { status: 403 });
    const updated = await Position.where({ id: positionId }).update({ title, description: typeof body?.description === "string" ? body.description.trim() || null : null, startTime, endTime, salary, salaryFrequency, salaryDayOfWeek, payerType, payerCharacterId });
    return NextResponse.json({ position: updated });
  }

  if (action !== "hire" && action !== "fire") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  const businessId = Number(body?.businessId);
  const owned = await getOwnedBusiness(user, businessId);
  if (owned.error) return owned.error;
  const business = owned.business;

  if (action === "hire") {
    const positionId = Number(body?.positionId);
    const characterId = Number(body?.characterId);
    const position = await Position.where({ id: positionId }).first();
    const character = await Character.where({ id: characterId }).first();
    if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "La plaza no pertenece a este negocio." }, { status: 400 });
    if (!position.active) return NextResponse.json({ error: "Esta plaza no está activa." }, { status: 400 });
    if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
    const known = await Relationship.where({ characterId: Number(owned.owner.id), knownCharacterId: characterId }).first();
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
