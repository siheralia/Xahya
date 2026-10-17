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
  return users.find((user: any) => user.clerkId === clerkId && String(user.role) === "ADMIN") ?? null;
}
function id(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${label} debe ser un ID válido.`);
  return n;
}
function count(value: unknown, label: string, allowZero = true) {
  const raw = String(value ?? (allowZero ? "0" : ""));
  if (!/^\d+$/.test(raw)) throw new Error(`${label} debe ser un entero no negativo.`);
  return BigInt(raw);
}
function text(value: unknown, label: string, max = 120) {
  const s = String(value ?? "").trim();
  if (!s || s.length > max) throw new Error(`${label} es obligatorio y debe tener máximo ${max} caracteres.`);
  return s;
}
function serial(value: any) {
  return value == null ? value : { ...value, ...(value.memberCount !== undefined ? { memberCount: String(value.memberCount) } : {}), ...(value.wealthShare !== undefined ? { wealthShare: String(value.wealthShare) } : {}) };
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar agrupaciones y reinos." }, { status: 403 });
  try {
    const M = db.orm.public as any;
    const [groups, memberships, polities, territories, polityGroups, cohorts, locations, characters, relations] = await Promise.all([
      M.WorldSocialGroup.all(), M.WorldSocialGroupMembership.all(), M.WorldPolity.all(),
      M.WorldPolityLocation.all(), M.WorldPolityGroup.all(), M.PopulationCohort.all(),
      M.WorldLocation.all(), M.Character.all(), M.WorldLeaderRelation.all(),
    ]);
    const locById = new Map(locations.map((x: any) => [Number(x.id), x.name]));
    const cohortById = new Map(cohorts.map((x: any) => [Number(x.id), x]));
    const groupById = new Map(groups.map((x: any) => [Number(x.id), x]));
    const polityById = new Map(polities.map((x: any) => [Number(x.id), x]));
    const charById = new Map(characters.map((x: any) => [Number(x.id), x.name]));
    return NextResponse.json({
      groups: groups.map((g: any) => ({ ...g, leaderName: charById.get(Number(g.leaderCharacterId)) ?? null,
        memberships: memberships.filter((m: any) => Number(m.groupId) === Number(g.id)).map((m: any) => ({
          ...serial(m), cohortName: cohortById.get(Number(m.cohortId))?.name ?? "Cohorte eliminada",
          locationName: locById.get(Number(cohortById.get(Number(m.cohortId))?.locationId)) ?? "Locación desconocida",
        })) })),
      polities: polities.map((p: any) => ({ ...p, founderName: charById.get(Number(p.founderCharacterId)) ?? null,
        territories: territories.filter((t: any) => Number(t.polityId) === Number(p.id)).map((t: any) => ({ ...t, locationName: locById.get(Number(t.locationId)) ?? "Locación desconocida" })),
        groups: polityGroups.filter((g: any) => Number(g.polityId) === Number(p.id)).map((g: any) => ({ ...g, groupName: groupById.get(Number(g.groupId))?.name ?? "Agrupación eliminada" })) })),
      cohorts: cohorts.filter((c: any) => c.active !== false).map((c: any) => ({ id: Number(c.id), name: c.name, locationId: Number(c.locationId), locationName: locById.get(Number(c.locationId)) ?? "Locación desconocida", population: String(c.population), wealth: String(c.wealth), active: c.active !== false })),
      locations: locations.filter((l: any) => l.publicationStatus !== "ARCHIVED").map((l: any) => ({ id: Number(l.id), name: l.name, type: l.type })),
      characters: characters.map((c: any) => ({ id: Number(c.id), name: c.name })),
      relations: relations.map((r: any) => ({ ...r, leaderName: charById.get(Number(r.leaderCharacterId)), followerName: charById.get(Number(r.followerCharacterId)) })),
    });
  } catch (error) {
    console.error("WORLD_SOCIAL_STRUCTURE_LIST_ERROR", error);
    return NextResponse.json({ error: "No se pudo cargar la estructura social. Comprueba que la migración de agrupaciones esté aplicada." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar agrupaciones y reinos." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const M = db.orm.public as any;
  try {
    let result: any;
    if (action === "create-group") {
      const groupType = String(body?.groupType ?? "OTHER");
      if (!["CLAN","GUILD","RELIGIOUS","CULTURAL","POLITICAL_MOVEMENT","MIGRANT_COMMUNITY","MILITARY","OTHER"].includes(groupType)) throw new Error("Tipo de agrupación inválido.");
      const leaderCharacterId = body?.leaderCharacterId ? id(body.leaderCharacterId, "Líder") : null;
      if (leaderCharacterId && !(await M.Character.where({ id: leaderCharacterId }).first())) throw new Error("El personaje líder no existe.");
      result = await M.WorldSocialGroup.create({ name: text(body.name, "El nombre"), groupType, description: String(body.description ?? "").trim() || null, leaderCharacterId, foundedAt: body.foundedAt ? new Date(body.foundedAt) : null, status: "ACTIVE" });
    } else if (action === "add-membership") {
      const groupId = id(body.groupId, "Agrupación");
      const cohortId = id(body.cohortId, "Cohorte");
      const memberCount = count(body.memberCount, "Integrantes");
      const wealthShare = count(body.wealthShare ?? "0", "Riqueza vinculada");
      const role = String(body.role ?? "MEMBER").trim().slice(0, 80) || "MEMBER";
      const [group, cohort] = await Promise.all([M.WorldSocialGroup.where({ id: groupId }).first(), M.PopulationCohort.where({ id: cohortId }).first()]);
      if (!group || !cohort || cohort.active === false) throw new Error("Selecciona una agrupación y una cohorte activa.");
      if (memberCount > BigInt(cohort.population) || wealthShare > BigInt(cohort.wealth)) throw new Error("La afiliación no puede superar la población o riqueza disponible de la cohorte.");
      const existing = await M.WorldSocialGroupMembership.where({ groupId, cohortId, role }).first();
      result = existing
        ? await M.WorldSocialGroupMembership.where({ id: Number(existing.id) }).update({ memberCount, wealthShare, notes: String(body.notes ?? "").trim() || null })
        : await M.WorldSocialGroupMembership.create({ groupId, cohortId, memberCount, wealthShare, role, notes: String(body.notes ?? "").trim() || null });
    } else if (action === "split-cohort") {
      const sourceId = id(body.sourceCohortId, "Cohorte de origen");
      const locationId = id(body.locationId, "Destino");
      const movingPopulation = count(body.population, "Población a trasladar", false);
      const requestedWealth = body.wealth === undefined || body.wealth === "" ? null : count(body.wealth, "Riqueza trasladada");
      const source = await M.PopulationCohort.where({ id: sourceId }).first();
      const location = await M.WorldLocation.where({ id: locationId }).first();
      if (!source || source.active === false) throw new Error("La cohorte de origen no existe o está inactiva.");
      if (!location || location.publicationStatus === "ARCHIVED") throw new Error("El destino no existe o está archivado.");
      const sourcePop = BigInt(source.population), sourceWealth = BigInt(source.wealth);
      if (movingPopulation <= BigInt(0) || movingPopulation >= sourcePop) throw new Error("La población trasladada debe ser mayor que cero y menor que la cohorte de origen; la cohorte original debe conservar habitantes.");
      const movingWealth = requestedWealth ?? (sourceWealth * movingPopulation / sourcePop);
      if (movingWealth > sourceWealth) throw new Error("La riqueza trasladada supera la riqueza de origen.");
      const groupId = body.groupId ? id(body.groupId, "Agrupación") : null;
      const polityId = body.polityId ? id(body.polityId, "Entidad política") : null;
      if (groupId && !(await M.WorldSocialGroup.where({ id: groupId }).first())) throw new Error("La agrupación no existe.");
      if (polityId && !(await M.WorldPolity.where({ id: polityId }).first())) throw new Error("La entidad política no existe.");
      result = await db.transaction(async (tx: any) => {
        const T = tx.orm.public as any;
        // Re-read inside the transaction so a concurrent split cannot allocate the same people twice.
        const currentSource = await T.PopulationCohort.where({ id: sourceId }).first();
        if (!currentSource || currentSource.active === false) throw new Error("La cohorte de origen ya no está disponible.");
        const currentPopulation = BigInt(currentSource.population);
        const currentWealth = BigInt(currentSource.wealth);
        if (movingPopulation <= BigInt(0) || movingPopulation >= currentPopulation) throw new Error("La población cambió: la cantidad trasladada ya no cabe en la cohorte de origen.");
        const currentMovingWealth = requestedWealth ?? (currentWealth * movingPopulation / currentPopulation);
        if (currentMovingWealth > currentWealth) throw new Error("La riqueza cambió: la cantidad solicitada ya no está disponible.");
        await T.PopulationCohort.where({ id: sourceId }).update({ population: currentPopulation - movingPopulation, wealth: currentWealth - currentMovingWealth });
        const fragment = await T.PopulationCohort.create({
          locationId, name: text(body.name, "El nombre de la nueva cohorte"), raceId: currentSource.raceId ?? null, occupationId: currentSource.occupationId ?? null, socialClassId: currentSource.socialClassId ?? null,
          race: currentSource.race, occupation: currentSource.occupation, socialClass: currentSource.socialClass, ageGroup: currentSource.ageGroup,
          population: movingPopulation, wealth: currentMovingWealth, birthRate: currentSource.birthRate, deathRate: currentSource.deathRate,
          migrationRate: currentSource.migrationRate, productivity: currentSource.productivity, consumption: currentSource.consumption,
          behavior: { ...(currentSource.behavior && typeof currentSource.behavior === "object" ? currentSource.behavior : {}), splitFromCohortId: sourceId, splitAt: new Date().toISOString(), splitReason: String(body.reason ?? "División social o migración").slice(0, 500) }, active: true,
        });
        let membership = null;
        if (groupId) membership = await T.WorldSocialGroupMembership.create({ groupId, cohortId: Number(fragment.id), memberCount: movingPopulation, wealthShare: currentMovingWealth, role: "FOLLOWERS", notes: "Afiliación creada al dividir la cohorte." });
        let territory = null;
        let polityGroupLink = null;
        if (polityId) {
          territory = await T.WorldPolityLocation.create({ polityId, locationId, relationType: String(body.territoryRelation ?? "CLAIM"), isCapital: body.isCapital === true });
          if (groupId) {
            const priorLink = await T.WorldPolityGroup.where({ polityId, groupId, relationType: "SUPPORTS" }).first();
            polityGroupLink = priorLink ?? await T.WorldPolityGroup.create({ polityId, groupId, relationType: "SUPPORTS" });
          }
        }
        return { fragment: serial(fragment), sourceUpdated: { id: sourceId, population: String(currentPopulation - movingPopulation), wealth: String(currentWealth - currentMovingWealth) }, membership, territory, polityGroupLink };
      });
    } else if (action === "create-polity") {
      const polityType = String(body.polityType ?? "KINGDOM");
      if (!["KINGDOM","CITY_STATE","EMPIRE","REPUBLIC","CONFEDERATION","TRIBE","PRINCIPALITY","OTHER"].includes(polityType)) throw new Error("Tipo de entidad política inválido.");
      const founderCharacterId = body?.founderCharacterId ? id(body.founderCharacterId, "Fundador") : null;
      const locationId = body?.locationId ? id(body.locationId, "Locación") : null;
      const groupId = body?.groupId ? id(body.groupId, "Agrupación") : null;
      if (founderCharacterId && !(await M.Character.where({ id: founderCharacterId }).first())) throw new Error("El personaje fundador no existe.");
      if (locationId && !(await M.WorldLocation.where({ id: locationId }).first())) throw new Error("La locación no existe.");
      if (groupId && !(await M.WorldSocialGroup.where({ id: groupId }).first())) throw new Error("La agrupación no existe.");
      result = await db.transaction(async (tx: any) => {
        const T = tx.orm.public as any;
        const polity = await T.WorldPolity.create({ name: text(body.name, "El nombre"), polityType, status: "PROPOSED", description: String(body.description ?? "").trim() || null, founderCharacterId, foundedAt: body.foundedAt ? new Date(body.foundedAt) : new Date() });
        const territory = locationId ? await T.WorldPolityLocation.create({ polityId: Number(polity.id), locationId, relationType: "CAPITAL", isCapital: true }) : null;
        const link = groupId ? await T.WorldPolityGroup.create({ polityId: Number(polity.id), groupId, relationType: "SUPPORTS" }) : null;
        return { polity, territory, groupLink: link };
      });
    } else if (action === "assign-territory") {
      const polityId = id(body.polityId, "Entidad política"), locationId = id(body.locationId, "Locación");
      const relationType = String(body.relationType ?? "CLAIM");
      if (!["CAPITAL","CONTROLS","CLAIM","INFLUENCE"].includes(relationType)) throw new Error("Tipo de relación territorial inválido.");
      if (!(await M.WorldPolity.where({ id: polityId }).first()) || !(await M.WorldLocation.where({ id: locationId }).first()) ) throw new Error("Selecciona una entidad política y una locación válidas.");
      result = await M.WorldPolityLocation.create({ polityId, locationId, relationType, isCapital: body.isCapital === true });
    } else if (action === "link-group") {
      const polityId = id(body.polityId, "Entidad política"), groupId = id(body.groupId, "Agrupación");
      const relationType = String(body.relationType ?? "SUPPORTS");
      if (!["SUPPORTS","MEMBER","OPPOSES","NEUTRAL","SUBJECTS"].includes(relationType)) throw new Error("Relación política inválida.");
      result = await M.WorldPolityGroup.create({ polityId, groupId, relationType });
    } else if (action === "link-leader") {
      const leaderCharacterId = id(body.leaderCharacterId, "Líder"), followerCharacterId = id(body.followerCharacterId, "Seguidor");
      if (leaderCharacterId === followerCharacterId) throw new Error("Un personaje no puede seguirse a sí mismo.");
      const loyalty = Number(body.loyalty ?? 50);
      if (!Number.isInteger(loyalty) || loyalty < 0 || loyalty > 100) throw new Error("La lealtad debe estar entre 0 y 100.");
      result = await M.WorldLeaderRelation.create({ leaderCharacterId, followerCharacterId, relationType: String(body.relationType ?? "FOLLOWER"), loyalty });
    } else {
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
    }
    await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_SOCIAL_STRUCTURE_" + action.toUpperCase().replace(/-/g, "_"), entityType: action.includes("polity") || action === "create-polity" ? "WORLD_POLITY" : "WORLD_SOCIAL_GROUP", entityId: Number(result?.id ?? result?.polity?.id ?? result?.fragment?.id ?? 0) || null, details: { action } });
    return NextResponse.json({ success: true, result: serial(result) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la estructura social.";
    if (/obligatorio|máximo|ID válido|entero no negativo|inválido|no existe|superar|debe ser mayor|no puede|selecciona|archivado|súper/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    console.error("WORLD_SOCIAL_STRUCTURE_SAVE_ERROR", error);
    return NextResponse.json({ error: "No se pudo guardar la estructura social. Comprueba los datos y la migración aplicada." }, { status: 500 });
  }
}
