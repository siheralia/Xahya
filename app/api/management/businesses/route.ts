import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((entry) => entry.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

const frequencies = ["DAILY", "WEEKLY"];

function validTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) &&
    Number(value.slice(0, 2)) <= 23 && Number(value.slice(3, 5)) <= 59;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Character = db.orm.public.Character;

  const [businesses, positions, contracts, characters] = await Promise.all([
    Business.all(), Position.all(), Contract.all(), Character.all(),
  ]);

  const systemPositions = positions.filter((position: any) => position.businessId == null).map((position: any) => ({
    ...position,
    payerCharacter: characters.find((character: any) => Number(character.id) === Number(position.payerCharacterId)) ?? null,
    contracts: contracts.filter((contract: any) => Number(contract.positionId) === Number(position.id) && contract.active).map((contract: any) => ({
      ...contract,
      character: characters.find((character: any) => Number(character.id) === Number(contract.characterId)) ?? null,
    })),
  }));

  return NextResponse.json({
    businesses: businesses.map((business: any) => ({
      ...business,
      ownerCharacter: characters.find((character: any) => Number(character.id) === Number(business.ownerCharacterId)) ?? null,
      positions: positions.filter((position: any) => Number(position.businessId) === Number(business.id)).map((position: any) => ({
        ...position,
        payerCharacter: characters.find((character: any) => Number(character.id) === Number(position.payerCharacterId)) ?? null,
        contracts: contracts.filter((contract: any) => Number(contract.positionId) === Number(position.id) && contract.active).map((contract: any) => ({
          ...contract,
          character: characters.find((character: any) => Number(character.id) === Number(contract.characterId)) ?? null,
        })),
      })),
    })),
    systemPositions,
    characters: characters.map((character: any) => ({ id: Number(character.id), name: String(character.name), flair: character.flair ?? null })),
  });
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "createBusiness") {
    const name = String(body?.name ?? "").trim();
    const ownerCharacterId = Number(body?.ownerCharacterId);
    const passiveIncome = Math.trunc(Number(body?.passiveIncome ?? 0));
    const passiveFrequency = String(body?.passiveFrequency ?? "WEEKLY");
    const passiveDayOfWeek = Math.trunc(Number(body?.passiveDayOfWeek ?? 0));
    const passiveTime = String(body?.passiveTime ?? "18:00");
    if (!name || name.length > 100) return NextResponse.json({ error: "El nombre del negocio es obligatorio." }, { status: 400 });
    if (!Number.isInteger(ownerCharacterId) || ownerCharacterId <= 0) return NextResponse.json({ error: "Dueño inválido." }, { status: 400 });
    if (!Number.isInteger(passiveIncome) || passiveIncome < 0) return NextResponse.json({ error: "Ganancia inválida." }, { status: 400 });
    if (!frequencies.includes(passiveFrequency) || passiveDayOfWeek < 0 || passiveDayOfWeek > 6 || !validTime(passiveTime)) {
      return NextResponse.json({ error: "Configuración de ganancia inválida." }, { status: 400 });
    }

    const owner = await db.orm.public.Character.where({ id: ownerCharacterId }).first();
    if (!owner) return NextResponse.json({ error: "El personaje dueño no existe." }, { status: 404 });

    const Business = (db.orm.public as any).Business;
    const business = await Business.create({
      name,
      description: typeof body?.description === "string" ? body.description.trim() || null : null,
      ownerCharacterId,
      passiveIncome,
      passiveFrequency,
      passiveDayOfWeek,
      passiveTime,
      balance: 0,
      active: true,
    });
    await recordAuditEvent({ actorUserId: admin.id, action: "BUSINESS_CREATE", entityType: "BUSINESS", entityId: Number(business.id), details: { name, ownerCharacterId, passiveIncome, passiveFrequency } });
    return NextResponse.json({ business }, { status: 201 });
  }

  if (action === "updateBusiness") {
    const id = Number(body?.id);
    const name = String(body?.name ?? "").trim();
    const ownerCharacterId = Number(body?.ownerCharacterId);
    const passiveIncome = Math.trunc(Number(body?.passiveIncome ?? 0));
    const passiveFrequency = String(body?.passiveFrequency ?? "WEEKLY");
    const passiveDayOfWeek = Math.trunc(Number(body?.passiveDayOfWeek ?? 0));
    const passiveTime = String(body?.passiveTime ?? "18:00");

    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Negocio inválido." }, { status: 400 });
    if (!name || name.length > 100) return NextResponse.json({ error: "El nombre del negocio es obligatorio." }, { status: 400 });
    if (!Number.isInteger(ownerCharacterId) || ownerCharacterId <= 0) return NextResponse.json({ error: "Dueño inválido." }, { status: 400 });
    if (!Number.isInteger(passiveIncome) || passiveIncome < 0) return NextResponse.json({ error: "Ganancia inválida." }, { status: 400 });
    if (!frequencies.includes(passiveFrequency) || passiveDayOfWeek < 0 || passiveDayOfWeek > 6 || !validTime(passiveTime)) {
      return NextResponse.json({ error: "Configuración de ganancia inválida." }, { status: 400 });
    }

    const owner = await db.orm.public.Character.where({ id: ownerCharacterId }).first();
    if (!owner) return NextResponse.json({ error: "El personaje dueño no existe." }, { status: 404 });

    const Business = (db.orm.public as any).Business;
    const existing = await Business.where({ id }).first();
    if (!existing) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });

    const business = await Business.where({ id }).update({
      name,
      description: typeof body?.description === "string" ? body.description.trim() || null : null,
      ownerCharacterId,
      passiveIncome,
      passiveFrequency,
      passiveDayOfWeek,
      passiveTime,
    });
    await recordAuditEvent({ actorUserId: admin.id, action: "BUSINESS_UPDATE", entityType: "BUSINESS", entityId: id, details: { name, ownerCharacterId, passiveIncome, passiveFrequency } });
    return NextResponse.json({ business });
  }

  if (action === "updatePosition") {
    const id = Number(body?.id);
    const rawBusinessId = body?.businessId === "" || body?.businessId == null ? null : Number(body.businessId);
    const businessId = rawBusinessId !== null && Number.isInteger(rawBusinessId) && rawBusinessId > 0 ? rawBusinessId : null;
    const title = String(body?.title ?? "").trim();
    const startTime = String(body?.startTime ?? "");
    const endTime = String(body?.endTime ?? "");
    const salary = Math.trunc(Number(body?.salary ?? 0));
    const salaryFrequency = String(body?.salaryFrequency ?? "DAILY");
    const salaryDayOfWeek = Math.trunc(Number(body?.salaryDayOfWeek ?? 0));
    const payerType = String(body?.payerType ?? "SYSTEM");
    const payerCharacterId = payerType === "CHARACTER" ? Number(body?.payerCharacterId) : null;

    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Puesto inválido." }, { status: 400 });
    if (!title || !validTime(startTime) || !validTime(endTime) || salary < 0 || !frequencies.includes(salaryFrequency)) {
      return NextResponse.json({ error: "Datos del puesto inválidos." }, { status: 400 });
    }
    if (!["SYSTEM", "CHARACTER"].includes(payerType)) return NextResponse.json({ error: "Pagador inválido." }, { status: 400 });
    if (salaryFrequency === "WEEKLY" && (salaryDayOfWeek < 0 || salaryDayOfWeek > 6)) return NextResponse.json({ error: "Día de pago inválido." }, { status: 400 });
    if (payerType === "CHARACTER") {
      const payer = await db.orm.public.Character.where({ id: payerCharacterId }).first();
      if (!payer) return NextResponse.json({ error: "El personaje pagador no existe." }, { status: 404 });
    }

    const Position = (db.orm.public as any).BusinessPosition;
    const existing = await Position.where({ id }).first();
    if (!existing) return NextResponse.json({ error: "Puesto no encontrado." }, { status: 404 });

    if (!businessId && payerType !== "SYSTEM") {
      return NextResponse.json({ error: "Un trabajo independiente solo puede ser pagado por el sistema." }, { status: 400 });
    }
    if (businessId) {
      const Business = (db.orm.public as any).Business;
      const business = await Business.where({ id: businessId }).first();
      if (!business) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    }

    const position = await Position.where({ id }).update({
      businessId,
      title,
      description: typeof body?.description === "string" ? body.description.trim() || null : null,
      startTime,
      endTime,
      salary,
      salaryFrequency,
      salaryDayOfWeek,
      payerType,
      payerCharacterId,
    });
    await recordAuditEvent({ actorUserId: admin.id, action: "BUSINESS_POSITION_UPDATE", entityType: "BUSINESS_POSITION", entityId: id, details: { businessId, title, salary, salaryFrequency } });
    return NextResponse.json({ position });
  }

  if (action === "createPosition") {
    const rawBusinessId = body?.businessId === "" || body?.businessId == null ? null : Number(body.businessId);
    const businessId = rawBusinessId !== null && Number.isInteger(rawBusinessId) && rawBusinessId > 0 ? rawBusinessId : null;
    const title = String(body?.title ?? "").trim();
    const startTime = String(body?.startTime ?? "");
    const endTime = String(body?.endTime ?? "");
    const salary = Math.trunc(Number(body?.salary ?? 0));
    const salaryFrequency = String(body?.salaryFrequency ?? "DAILY");
    const salaryDayOfWeek = Math.trunc(Number(body?.salaryDayOfWeek ?? 0));
    const payerType = String(body?.payerType ?? "SYSTEM");
    const payerCharacterId = payerType === "CHARACTER" ? Number(body?.payerCharacterId) : null;

    if (!title || !validTime(startTime) || !validTime(endTime) || salary < 0 || !frequencies.includes(salaryFrequency)) {
      return NextResponse.json({ error: "Datos del puesto inválidos." }, { status: 400 });
    }
    if (!["SYSTEM", "CHARACTER"].includes(payerType)) return NextResponse.json({ error: "Pagador inválido." }, { status: 400 });
    if (salaryFrequency === "WEEKLY" && (salaryDayOfWeek < 0 || salaryDayOfWeek > 6)) return NextResponse.json({ error: "Día de pago inválido." }, { status: 400 });
    if (payerType === "CHARACTER") {
      const payer = await db.orm.public.Character.where({ id: payerCharacterId }).first();
      if (!payer) return NextResponse.json({ error: "El personaje pagador no existe." }, { status: 404 });
    }

    const Position = (db.orm.public as any).BusinessPosition;
    if (!businessId && payerType !== "SYSTEM") {
      return NextResponse.json({ error: "Un trabajo independiente solo puede ser pagado por el sistema." }, { status: 400 });
    }
    if (businessId) {
      const Business = (db.orm.public as any).Business;
      const business = await Business.where({ id: businessId }).first();
      if (!business) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    }

    const position = await Position.create({
      businessId,
      title,
      description: typeof body?.description === "string" ? body.description.trim() || null : null,
      startTime,
      endTime,
      salary,
      salaryFrequency,
      salaryDayOfWeek,
      payerType,
      payerCharacterId,
      active: true,
    });
    await recordAuditEvent({ actorUserId: admin.id, action: "BUSINESS_POSITION_CREATE", entityType: "BUSINESS_POSITION", entityId: Number(position.id), details: { businessId, title, salary, salaryFrequency } });
    return NextResponse.json({ position }, { status: 201 });
  }

  if (action === "hire") {
    const positionId = Number(body?.positionId);
    const characterId = Number(body?.characterId);
    if (!Number.isInteger(positionId) || !Number.isInteger(characterId)) return NextResponse.json({ error: "Puesto o personaje inválido." }, { status: 400 });

    const Position = (db.orm.public as any).BusinessPosition;
    const Contract = (db.orm.public as any).EmploymentContract;
    const position = await Position.where({ id: positionId }).first();
    const character = await db.orm.public.Character.where({ id: characterId }).first();
    if (!position || !character) return NextResponse.json({ error: "Puesto o personaje no encontrado." }, { status: 404 });

    const existing = (await Contract.where({ positionId }).all()).find((contract: any) => contract.active);
    if (existing) return NextResponse.json({ error: "Ese puesto ya tiene una persona contratada." }, { status: 400 });

    const activeContracts = (await Contract.where({ characterId }).all()).filter((contract: any) => contract.active);
    const minutes = (value: unknown) => {
      const match = /^(\\d{2}):(\\d{2})$/.exec(String(value ?? ""));
      return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
    };
    const splitShift = (startValue: unknown, endValue: unknown) => {
      const start = minutes(startValue);
      const end = minutes(endValue);
      if (start < 0 || end < 0 || start === end) return [[0, 1440]];
      return end > start ? [[start, end]] : [[start, 1440], [0, end]];
    };
    const candidateShift = splitShift(position.startTime, position.endTime);
    for (const contract of activeContracts) {
      const otherPosition = await Position.where({ id: Number(contract.positionId) }).first();
      if (!otherPosition) continue;
      const otherShift = splitShift(otherPosition.startTime, otherPosition.endTime);
      if (candidateShift.some(([start, end]) => otherShift.some(([otherStart, otherEnd]) => start < otherEnd && otherStart < end))) {
        return NextResponse.json({
          error: `Ese personaje ya tiene un turno que se solapa con ${otherPosition.title} (${otherPosition.startTime}–${otherPosition.endTime}). Solo puedes contratarlo en turnos compatibles.`,
        }, { status: 400 });
      }
    }

    try {
      const contract = await Contract.create({ positionId, characterId, startDate: Temporal.Instant.fromEpochMilliseconds(Date.now()), endDate: null, active: true });
      await recordAuditEvent({ actorUserId: admin.id, action: "EMPLOYMENT_CREATE", entityType: "EMPLOYMENT_CONTRACT", entityId: Number(contract.id), characterId, details: { positionId, businessId: position.businessId ? Number(position.businessId) : null } });
      return NextResponse.json({ contract }, { status: 201 });
    } catch (error) {
      console.error("EMPLOYMENT_CREATE failed", error);
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `No se pudo contratar al personaje: ${message}` }, { status: 500 });
    }
  }

  if (action === "fire") {
    const contractId = Number(body?.contractId);
    const Contract = (db.orm.public as any).EmploymentContract;
    const contract = await Contract.where({ id: contractId }).first();
    if (!contract) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
    await Contract.where({ id: contractId }).update({ active: false, endDate: Temporal.Instant.fromEpochMilliseconds(Date.now()) });
    await recordAuditEvent({ actorUserId: admin.id, action: "EMPLOYMENT_END", entityType: "EMPLOYMENT_CONTRACT", entityId: contractId, characterId: Number(contract.characterId), details: {} });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
