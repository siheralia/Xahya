import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((entry) => entry.clerkId === clerkId && String(entry.role) === "ADMIN") ?? null;
}

function safeCount(value: unknown, label: string) {
  const text = String(value ?? "0").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label} debe ser un entero no negativo.`);
  try { return BigInt(text); } catch { throw new Error(`${label} no es válido.`); }
}

function rate(value: unknown, fallback: number, label: string, min = 0, max = 1) {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} debe estar entre ${min} y ${max}.`);
  return parsed;
}

function fields(body: any) {
  const name = String(body?.name ?? "").trim();
  const race = String(body?.race ?? "Sin especificar").trim() || "Sin especificar";
  const occupation = String(body?.occupation ?? "Sin especificar").trim() || "Sin especificar";
  const socialClass = String(body?.socialClass ?? "Sin especificar").trim() || "Sin especificar";
  const ageGroup = String(body?.ageGroup ?? "Mixta").trim() || "Mixta";
  const locationId = Number(body?.locationId);
  if (!name || name.length > 120) throw new Error("El nombre de la cohorte es obligatorio (máximo 120 caracteres).");
  if (!Number.isSafeInteger(locationId) || locationId <= 0) throw new Error("Selecciona una locación válida.");
  if ([race, occupation, socialClass, ageGroup].some((value) => value.length > 120)) throw new Error("Las características no pueden superar 120 caracteres.");
  const behavior = body?.behavior && typeof body.behavior === "object" && !Array.isArray(body.behavior) ? body.behavior : {};
  return {
    name, race, occupation, socialClass, ageGroup, locationId,
    population: safeCount(body?.population, "La población"),
    wealth: safeCount(body?.wealth, "La riqueza"),
    birthRate: rate(body?.birthRate, 0.012, "La tasa de natalidad"),
    deathRate: rate(body?.deathRate, 0.008, "La tasa de mortalidad"),
    migrationRate: rate(body?.migrationRate, 0, "La tasa migratoria", -1, 1),
    productivity: rate(body?.productivity, 1, "La productividad", 0, 1000000),
    consumption: rate(body?.consumption, 1, "El consumo", 0, 1000000),
    behavior,
    active: body?.active !== false,
  };
}

function serializeCohort(entry: any) {
  return { ...entry, population: String(entry.population ?? 0), wealth: String(entry.wealth ?? 0) };
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar las cohortes." }, { status: 403 });
  try {
    const Cohort = (db.orm.public as any).PopulationCohort;
    const Location = (db.orm.public as any).WorldLocation;
    const Run = (db.orm.public as any).WorldSimulationRun;
    const [cohorts, locations, runs] = await Promise.all([Cohort.all(), Location.all(), Run.all()]);
    const locationById = new Map<number, any>(locations.map((location: any) => [Number(location.id), location]));
    return NextResponse.json({
      cohorts: cohorts.map((entry: any) => ({ ...serializeCohort(entry), locationName: locationById.get(Number(entry.locationId))?.name ?? "Locación desconocida" }))
        .sort((a: any, b: any) => a.locationName.localeCompare(b.locationName, "es") || a.name.localeCompare(b.name, "es")),
      locations: locations.filter((entry: any) => entry.publicationStatus !== "ARCHIVED")
        .map((entry: any) => ({ id: Number(entry.id), name: entry.name, type: entry.type, publicationStatus: entry.publicationStatus }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "es")),
      runs: runs.map((entry: any) => ({ ...entry, id: Number(entry.id) }))
        .sort((a: any, b: any) => String(b.completedAt).localeCompare(String(a.completedAt))).slice(0, 20),
    });
  } catch (error) {
    console.error("WORLD_COHORT_LIST_ERROR", error);
    return NextResponse.json({ error: "No se pudieron cargar las cohortes. Aplica la migración de población del mundo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar las cohortes." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "create");
  const Cohort = (db.orm.public as any).PopulationCohort;
  const Location = (db.orm.public as any).WorldLocation;
  const Run = (db.orm.public as any).WorldSimulationRun;
  try {
    if (action === "simulate-economy") {
      const periodKey = String(body?.periodKey ?? "").trim();
      if (!/^world-economy-annual-[A-Za-z0-9-]{1,100}$/.test(periodKey)) {
        return NextResponse.json({ error: "Clave de ciclo económico inválida." }, { status: 400 });
      }
      const previous = await Run.where({ periodKey }).first();
      if (previous) return NextResponse.json({ alreadyRun: true, run: previous, summary: previous.summary });

      const result = await db.transaction(async (tx) => {
        const TxCohort = (tx.orm.public as any).PopulationCohort;
        const TxRun = (tx.orm.public as any).WorldSimulationRun;
        const TxBusiness = (tx.orm.public as any).Business;
        const existingRun = await TxRun.where({ periodKey }).first();
        if (existingRun) return { alreadyRun: true, run: existingRun, summary: existingRun.summary };

        const activeCohorts = (await TxCohort.all()).filter((entry: any) => entry.active !== false);
        const businesses = (await TxBusiness.all()).filter((entry: any) => entry.active !== false);
        const scale = BigInt(1000);
        let populationProcessed = BigInt(0);
        let wealthBefore = BigInt(0);
        let wealthAfter = BigInt(0);
        let productionTotal = BigInt(0);
        let consumptionTotal = BigInt(0);
        let unmetConsumptionTotal = BigInt(0);
        let cohortsWithProduction = 0;

        const locationTotals = new Map<number, { locationId: number; population: bigint; production: bigint; consumption: bigint; businesses: number }>();
        for (const cohort of activeCohorts) {
          const population = BigInt(cohort.population ?? 0);
          const wealth = BigInt(cohort.wealth ?? 0);
          const productivity = Number(cohort.productivity ?? 1);
          const consumptionRate = Number(cohort.consumption ?? 1);
          const production = population * BigInt(Math.round(productivity * 1000)) / scale;
          const consumption = population * BigInt(Math.round(consumptionRate * 1000)) / scale;
          const availableWealth = wealth + production;
          const nextWealth = availableWealth > consumption ? availableWealth - consumption : BigInt(0);
          const unmetConsumption = consumption > availableWealth ? consumption - availableWealth : BigInt(0);

          populationProcessed += population;
          wealthBefore += wealth;
          wealthAfter += nextWealth;
          productionTotal += production;
          consumptionTotal += consumption;
          unmetConsumptionTotal += unmetConsumption;
          if (production > BigInt(0)) cohortsWithProduction++;
          await TxCohort.where({ id: Number(cohort.id) }).update({ wealth: nextWealth });

          const locationId = Number(cohort.locationId);
          const local = locationTotals.get(locationId) ?? { locationId, population: BigInt(0), production: BigInt(0), consumption: BigInt(0), businesses: 0 };
          local.population += population;
          local.production += production;
          local.consumption += consumption;
          locationTotals.set(locationId, local);
        }

        for (const business of businesses) {
          if (business.locationId == null) continue;
          const local = locationTotals.get(Number(business.locationId));
          if (local) local.businesses++;
        }

        const summary = {
          cohortsProcessed: activeCohorts.length,
          populationProcessed: String(populationProcessed),
          wealthBefore: String(wealthBefore),
          wealthAfter: String(wealthAfter),
          production: String(productionTotal),
          consumption: String(consumptionTotal),
          unmetConsumption: String(unmetConsumptionTotal),
          locations: Array.from(locationTotals.values()).map((local) => ({
            locationId: local.locationId,
            population: String(local.population),
            production: String(local.production),
            consumption: String(local.consumption),
            activeBusinesses: local.businesses,
          })),
          cohortsWithProduction,
          formula: "riqueza final = max(0, riqueza inicial + población × productividad − población × consumo)",
          businessAccounting: "Los negocios locales se cuentan como contexto territorial; sus cajas, salarios y reinversiones siguen en la economía operativa para evitar doble contabilización.",
        };
        const run = await TxRun.create({
          simulationType: "WORLD_ECONOMY_ANNUAL",
          periodKey,
          status: "COMPLETED",
          summary,
        });
        return { alreadyRun: false, run, summary };
      });

      await recordAuditEvent({
        actorUserId: Number(admin.id),
        action: result.alreadyRun ? "WORLD_ECONOMIC_CYCLE_REPLAY" : "WORLD_ECONOMIC_CYCLE",
        entityType: "WORLD_SIMULATION_RUN",
        entityId: Number(result.run.id),
        details: { periodKey, summary: result.summary ?? result.run.summary },
      });
      return NextResponse.json(result, { status: result.alreadyRun ? 200 : 201 });
    }

    if (action === "simulate-demographics") {
      const periodKey = String(body?.periodKey ?? "").trim();
      if (!/^population-demographic-[A-Za-z0-9-]{1,100}$/.test(periodKey)) {
        return NextResponse.json({ error: "Clave de ciclo demográfico inválida." }, { status: 400 });
      }
      const previous = await Run.where({ periodKey }).first();
      if (previous) return NextResponse.json({ alreadyRun: true, run: previous });

      const result = await db.transaction(async (tx) => {
        const TxCohort = (tx.orm.public as any).PopulationCohort;
        const TxRun = (tx.orm.public as any).WorldSimulationRun;
        const existingRun = await TxRun.where({ periodKey }).first();
        if (existingRun) return { alreadyRun: true, run: existingRun, summary: existingRun.summary };
        const activeCohorts = (await TxCohort.all()).filter((entry: any) => entry.active !== false);
        const scale = BigInt(1_000_000);
        let populationBefore = BigInt(0);
        let populationAfter = BigInt(0);
        let birthsTotal = BigInt(0);
        let deathsTotal = BigInt(0);
        let migrationTotal = BigInt(0);

        for (const cohort of activeCohorts) {
          const population = BigInt(cohort.population ?? 0);
          const births = population * BigInt(Math.round(Number(cohort.birthRate ?? 0.012) * 1_000_000)) / scale;
          const deaths = population * BigInt(Math.round(Number(cohort.deathRate ?? 0.008) * 1_000_000)) / scale;
          const migrationRate = Number(cohort.migrationRate ?? 0);
          const migration = population * BigInt(Math.round(migrationRate * 1_000_000)) / scale;
          const rawPopulation = population + births - deaths + migration;
          const nextPopulation = rawPopulation < BigInt(0) ? BigInt(0) : rawPopulation;
          populationBefore += population;
          populationAfter += nextPopulation;
          birthsTotal += births;
          deathsTotal += deaths;
          migrationTotal += migration;
          await TxCohort.where({ id: Number(cohort.id) }).update({ population: nextPopulation });
        }

        const summary = {
          cohortsProcessed: activeCohorts.length,
          populationBefore: String(populationBefore),
          populationAfter: String(populationAfter),
          births: String(birthsTotal),
          deaths: String(deathsTotal),
          netMigration: String(migrationTotal),
          formula: "población + nacimientos - muertes + migración neta",
        };
        const run = await TxRun.create({
          simulationType: "DEMOGRAPHIC_ANNUAL",
          periodKey,
          status: "COMPLETED",
          summary,
        });
        return { alreadyRun: false, run, summary };
      });
      await recordAuditEvent({
        actorUserId: Number(admin.id),
        action: result.alreadyRun ? "WORLD_DEMOGRAPHIC_CYCLE_REPLAY" : "WORLD_DEMOGRAPHIC_CYCLE",
        entityType: "WORLD_SIMULATION_RUN",
        entityId: Number(result.run.id),
        details: { periodKey, summary: result.summary ?? result.run.summary },
      });
      return NextResponse.json(result, { status: result.alreadyRun ? 200 : 201 });
    }

    if (action === "delete") {
      const id = Number(body?.id);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de cohorte inválido." }, { status: 400 });
      const existing = await Cohort.where({ id }).first();
      if (!existing) return NextResponse.json({ error: "La cohorte no existe." }, { status: 404 });
      await Cohort.where({ id }).delete();
      await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_COHORT_DELETE", entityType: "WORLD_COHORT", entityId: id, details: { name: existing.name } });
      return NextResponse.json({ success: true });
    }
    const data = fields(body);
    const location = await Location.where({ id: data.locationId }).first();
    if (!location) return NextResponse.json({ error: "La locación seleccionada no existe." }, { status: 400 });
    if (location.publicationStatus === "ARCHIVED") return NextResponse.json({ error: "No puedes asignar población a una locación archivada." }, { status: 400 });
    if (action === "update") {
      const id = Number(body?.id);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de cohorte inválido." }, { status: 400 });
      const existing = await Cohort.where({ id }).first();
      if (!existing) return NextResponse.json({ error: "La cohorte no existe." }, { status: 404 });
      const updated = await Cohort.where({ id }).update(data);
      await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_COHORT_UPDATE", entityType: "WORLD_COHORT", entityId: id, details: { name: data.name, locationId: data.locationId, population: String(data.population) } });
      return NextResponse.json({ cohort: serializeCohort(updated) });
    }
    if (action !== "create") return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
    const created = await Cohort.create(data);
    await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_COHORT_CREATE", entityType: "WORLD_COHORT", entityId: Number(created.id), details: { name: data.name, locationId: data.locationId, population: String(data.population) } });
    return NextResponse.json({ cohort: serializeCohort(created) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la cohorte.";
    if (message.includes("debe ser") || message.includes("no es válido") || message.includes("obligatorio") || message.includes("máximo") || message.includes("entre") || message.includes("Selecciona") || message.includes("locación")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("WORLD_COHORT_SAVE_ERROR", error);
    return NextResponse.json({ error: "No se pudo guardar la cohorte." }, { status: 500 });
  }
}
