import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["TOWER", "ORBITAL_SATELLITE", "GLOBAL_HEADQUARTERS", "BUILDING", "WORKSHOP", "WAREHOUSE", "VEHICLE", "EQUIPMENT", "STORE", "FACILITY"] as const;
const STATUSES = ["PLANNED", "ACTIVE", "INACTIVE", "MAINTENANCE", "DAMAGED"] as const;
const PUBLICATION = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const LINK_TYPES = ["ROAD", "RAIL", "WATER", "POWER", "SUPPLY", "DATA", "TRANSMISSION", "BACKHAUL", "SATELLITE_UPLINK", "SATELLITE_DOWNLINK", "HEADQUARTERS_CONTROL", "CUSTOM"] as const;

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((entry) => entry.clerkId === clerkId && String(entry.role) === "ADMIN") ?? null;
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} no es válido.`);
  return id;
}

function optionalId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return positiveId(value, label);
}

function objectValue(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} debe ser un objeto JSON.`);
  return value;
}

function infrastructureFields(body: any) {
  const code = String(body?.code ?? "").trim().toUpperCase();
  const name = String(body?.name ?? "").trim();
  const kind = String(body?.kind ?? "");
  const worldLocationId = optionalId(body?.worldLocationId, "La locación");
  const businessId = optionalId(body?.businessId, "El negocio");
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const foundingHistory = typeof body?.foundingHistory === "string" ? body.foundingHistory.trim() || null : null;
  const constructionType = typeof body?.constructionType === "string" ? body.constructionType.trim() || null : null;
  const operationalStatus = String(body?.operationalStatus ?? "PLANNED");
  const publicationStatus = String(body?.publicationStatus ?? "DRAFT");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw new Error("El código debe tener 2–40 caracteres: letras, números, guiones o guiones bajos.");
  if (!name || name.length > 120) throw new Error("El nombre es obligatorio (máximo 120 caracteres).");
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error("Tipo de infraestructura inválido.");
  if (!(STATUSES as readonly string[]).includes(operationalStatus)) throw new Error("Estado operativo inválido.");
  if (!(PUBLICATION as readonly string[]).includes(publicationStatus)) throw new Error("Estado de publicación inválido.");
  for (const [label, value, max] of [["Descripción", description, 4000], ["Historia de fundación", foundingHistory, 6000], ["Tipo de construcción", constructionType, 120]] as const) {
    if (value && value.length > max) throw new Error(`${label} supera el límite de ${max} caracteres.`);
  }
  return {
    code, name, kind, worldLocationId, businessId, description, foundingHistory, constructionType,
    operationalStatus, publicationStatus,
    coverage: objectValue(body?.coverage, "La cobertura"),
    details: objectValue(body?.details, "Los detalles"),
  };
}

function linkFields(body: any) {
  const sourceId = positiveId(body?.sourceId, "El nodo de origen");
  const targetId = positiveId(body?.targetId, "El nodo de destino");
  const linkType = String(body?.linkType ?? "TRANSMISSION");
  const operationalStatus = String(body?.operationalStatus ?? "PLANNED");
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  if (sourceId === targetId) throw new Error("Un nodo no puede conectarse consigo mismo.");
  if (!(LINK_TYPES as readonly string[]).includes(linkType)) throw new Error("Tipo de conexión inválido.");
  if (!(STATUSES as readonly string[]).includes(operationalStatus)) throw new Error("Estado de conexión inválido.");
  if (description && description.length > 2000) throw new Error("La descripción de conexión no puede superar 2000 caracteres.");
  return { sourceId, targetId, linkType, operationalStatus, description, details: objectValue(body?.details, "Los detalles de conexión") };
}

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("no es válido") || message.includes("obligatorio") || message.includes("supera") || message.includes("debe ser") || message.includes("inválido") || message.includes("conectarse")) return message;
  return null;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar la infraestructura del mundo." }, { status: 403 });
  try {
    const Infrastructure = (db.orm.public as any).WorldInfrastructure;
    const Link = (db.orm.public as any).WorldInfrastructureLink;
    const Location = (db.orm.public as any).WorldLocation;
    const Business = (db.orm.public as any).Business;
    const [nodes, links, locations, businesses] = await Promise.all([Infrastructure.all(), Link.all(), Location.all(), Business.all()]);
    const businessById = new Map<number, any>(businesses.map((business: any) => [Number(business.id), business]));
    const locationById = new Map<number, any>(locations.map((location: any) => [Number(location.id), location]));
    const nodeById = new Map<number, any>(nodes.map((node: any) => [Number(node.id), node]));
    return NextResponse.json({
      nodes: nodes.map((node: any) => ({
        ...node,
        id: Number(node.id),
        worldLocationId: node.worldLocationId == null ? null : Number(node.worldLocationId),
        businessId: node.businessId == null ? null : Number(node.businessId),
        businessName: node.businessId == null ? null : businessById.get(Number(node.businessId))?.name ?? null,
        locationName: node.worldLocationId == null ? null : locationById.get(Number(node.worldLocationId))?.name ?? null,
      })).sort((a: any, b: any) => a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code)),
      links: links.map((link: any) => ({
        ...link, id: Number(link.id), sourceId: Number(link.sourceId), targetId: Number(link.targetId),
        sourceName: nodeById.get(Number(link.sourceId))?.name ?? "Nodo desconocido",
        targetName: nodeById.get(Number(link.targetId))?.name ?? "Nodo desconocido",
      })).sort((a: any, b: any) => a.sourceName.localeCompare(b.sourceName, "es") || a.targetName.localeCompare(b.targetName, "es")),
      businesses: businesses.filter((business: any) => business.active !== false).map((business: any) => ({ id: Number(business.id), name: business.name, locationId: business.locationId == null ? null : Number(business.locationId) })).sort((a: any, b: any) => a.name.localeCompare(b.name, "es")),
      locations: locations.filter((location: any) => location.publicationStatus !== "ARCHIVED")
        .map((location: any) => ({ id: Number(location.id), name: location.name, type: location.type, parentId: location.parentId == null ? null : Number(location.parentId) }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "es")),
      kinds: KINDS, statuses: STATUSES, publicationStatuses: PUBLICATION, linkTypes: LINK_TYPES,
    });
  } catch (error) {
    console.error("WORLD_INFRASTRUCTURE_LIST_ERROR", error);
    return NextResponse.json({ error: "No se pudo cargar la infraestructura del mundo. Comprueba que la migración de infraestructura esté aplicada." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar la infraestructura del mundo." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud JSON inválida." }, { status: 400 });
  const action = String(body.action ?? "create-node");
  const Infrastructure = (db.orm.public as any).WorldInfrastructure;
  const Link = (db.orm.public as any).WorldInfrastructureLink;
  const Location = (db.orm.public as any).WorldLocation;
  const Business = (db.orm.public as any).Business;

  try {
    if (action.endsWith("-node")) {
      if (action === "delete-node") {
        const id = positiveId(body.id, "El ID del nodo");
        const existing = await Infrastructure.where({ id }).first();
        if (!existing) return NextResponse.json({ error: "El nodo no existe." }, { status: 404 });
        await Infrastructure.where({ id }).delete();
        await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_INFRASTRUCTURE_DELETE", entityType: "WORLD_INFRASTRUCTURE", entityId: id, details: { code: existing.code, name: existing.name } });
        return NextResponse.json({ success: true });
      }
      if (action !== "create-node" && action !== "update-node") return NextResponse.json({ error: "Acción de nodo no reconocida." }, { status: 400 });
      const fields = infrastructureFields(body);
      if (fields.businessId !== null) {
        const business = await Business.where({ id: fields.businessId }).first();
        if (!business) return NextResponse.json({ error: "El negocio seleccionado no existe." }, { status: 400 });
      }
      if (fields.worldLocationId !== null) {
        const location = await Location.where({ id: fields.worldLocationId }).first();
        if (!location) return NextResponse.json({ error: "La locación seleccionada no existe." }, { status: 400 });
        if (location.publicationStatus === "ARCHIVED") return NextResponse.json({ error: "No puedes asignar infraestructura a una locación archivada." }, { status: 400 });
      }
      let saved: any;
      if (action === "update-node") {
        const id = positiveId(body.id, "El ID del nodo");
        if (!(await Infrastructure.where({ id }).first())) return NextResponse.json({ error: "El nodo no existe." }, { status: 404 });
        saved = await Infrastructure.where({ id }).update(fields);
      } else {
        saved = await Infrastructure.create(fields);
      }
      await recordAuditEvent({ actorUserId: Number(admin.id), action: action === "update-node" ? "WORLD_INFRASTRUCTURE_UPDATE" : "WORLD_INFRASTRUCTURE_CREATE", entityType: "WORLD_INFRASTRUCTURE", entityId: Number(saved.id), details: { code: fields.code, name: fields.name, kind: fields.kind, worldLocationId: fields.worldLocationId, businessId: fields.businessId } });
      return NextResponse.json({ node: { ...saved, id: Number(saved.id) } }, { status: action === "create-node" ? 201 : 200 });
    }

    if (action.endsWith("-link")) {
      if (action === "delete-link") {
        const id = positiveId(body.id, "El ID de la conexión");
        const existing = await Link.where({ id }).first();
        if (!existing) return NextResponse.json({ error: "La conexión no existe." }, { status: 404 });
        await Link.where({ id }).delete();
        await recordAuditEvent({ actorUserId: Number(admin.id), action: "WORLD_INFRASTRUCTURE_LINK_DELETE", entityType: "WORLD_INFRASTRUCTURE_LINK", entityId: id, details: { sourceId: Number(existing.sourceId), targetId: Number(existing.targetId), linkType: existing.linkType } });
        return NextResponse.json({ success: true });
      }
      if (action !== "create-link" && action !== "update-link") return NextResponse.json({ error: "Acción de conexión no reconocida." }, { status: 400 });
      const fields = linkFields(body);
      const [source, target] = await Promise.all([Infrastructure.where({ id: fields.sourceId }).first(), Infrastructure.where({ id: fields.targetId }).first()]);
      if (!source || !target) return NextResponse.json({ error: "Ambos nodos de la conexión deben existir." }, { status: 400 });
      let saved: any;
      if (action === "update-link") {
        const id = positiveId(body.id, "El ID de la conexión");
        if (!(await Link.where({ id }).first())) return NextResponse.json({ error: "La conexión no existe." }, { status: 404 });
        saved = await Link.where({ id }).update(fields);
      } else {
        saved = await Link.create(fields);
      }
      await recordAuditEvent({ actorUserId: Number(admin.id), action: action === "update-link" ? "WORLD_INFRASTRUCTURE_LINK_UPDATE" : "WORLD_INFRASTRUCTURE_LINK_CREATE", entityType: "WORLD_INFRASTRUCTURE_LINK", entityId: Number(saved.id), details: { sourceId: fields.sourceId, targetId: fields.targetId, linkType: fields.linkType } });
      return NextResponse.json({ link: { ...saved, id: Number(saved.id) } }, { status: action === "create-link" ? 201 : 200 });
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    const validation = messageFor(error);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });
    console.error("WORLD_INFRASTRUCTURE_SAVE_ERROR", error);
    return NextResponse.json({ error: "No se pudo guardar la infraestructura del mundo. Revisa que el código no esté duplicado y que la migración esté aplicada." }, { status: 500 });
  }
}
