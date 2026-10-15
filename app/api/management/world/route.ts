import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

const LOCATION_TYPES = [
  "CONTINENT", "REGION", "CITY", "ISLAND", "ARCHIPELAGO",
  "FLOATING_ISLAND", "NEIGHBORHOOD", "BUILDING", "POINT_OF_INTEREST",
] as const;
const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const OPERATIONAL_STATUSES = ["ACTIVE", "INACTIVE"] as const;
const CLAIMABILITY_VALUES = ["NOT_CLAIMABLE", "CLAIMABLE"] as const;

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((entry) => entry.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

function nullableId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function validateFields(body: any) {
  const name = String(body?.name ?? "").trim();
  const type = String(body?.type ?? "");
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const parentId = nullableId(body?.parentId);
  const publicationStatus = String(body?.publicationStatus ?? "DRAFT");
  const operationalStatus = String(body?.operationalStatus ?? "ACTIVE");
  const claimability = String(body?.claimability ?? "NOT_CLAIMABLE");

  if (!name || name.length > 120) return { error: "El nombre es obligatorio y debe tener 120 caracteres o menos." };
  if (!(LOCATION_TYPES as readonly string[]).includes(type)) return { error: "Tipo de locación inválido." };
  if (description && description.length > 4000) return { error: "La descripción no puede superar 4000 caracteres." };
  if (Number.isNaN(parentId)) return { error: "La locación superior no es válida." };
  if (!(PUBLICATION_STATUSES as readonly string[]).includes(publicationStatus)) return { error: "Estado de publicación inválido." };
  if (!(OPERATIONAL_STATUSES as readonly string[]).includes(operationalStatus)) return { error: "Estado operativo inválido." };
  if (!(CLAIMABILITY_VALUES as readonly string[]).includes(claimability)) return { error: "Disponibilidad para reclamación inválida." };

  return { data: { name, type, description, parentId, publicationStatus, operationalStatus, claimability } };
}

async function validateParentChain(parentId: number | null, locationId?: number) {
  if (parentId === null) return null;
  const Location = (db.orm.public as any).WorldLocation;
  const locations = await Location.all();
  const byId = new Map<number, any>(locations.map((entry: any) => [Number(entry.id), entry]));
  if (!byId.has(parentId)) return "La locación superior no existe.";

  const visited = new Set<number>();
  let cursor: number | null = parentId;
  while (cursor !== null) {
    if (cursor === locationId) return "No puedes mover una locación dentro de sí misma o de uno de sus descendientes.";
    if (visited.has(cursor)) return "La jerarquía existente contiene un ciclo; revisa las locaciones antes de continuar.";
    visited.add(cursor);
    const entry = byId.get(cursor);
    cursor = entry?.parentId == null ? null : Number(entry.parentId);
  }
  return null;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar el mundo." }, { status: 403 });

  try {
    const Location = (db.orm.public as any).WorldLocation;
    const locations = await Location.all();
    const byId = new Map<number, any>(locations.map((entry: any) => [Number(entry.id), entry]));
    const result = locations
      .map((entry: any) => ({
        ...entry,
        parentName: entry.parentId == null ? null : byId.get(Number(entry.parentId))?.name ?? null,
        childrenCount: locations.filter((child: any) => Number(child.parentId) === Number(entry.id)).length,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "es"));
    return NextResponse.json({ locations: result, locationTypes: LOCATION_TYPES });
  } catch (error) {
    console.error("WORLD_LOCATION_LIST_ERROR", error);
    return NextResponse.json({ error: "No se pudieron cargar las locaciones. Comprueba que la migración geográfica esté aplicada." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar el mundo." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "create");
  const validated = validateFields(body);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
  const fields = validated.data;
  const Location = (db.orm.public as any).WorldLocation;

  try {
    if (action === "update") {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID de locación inválido." }, { status: 400 });
      const existing = await Location.where({ id }).first();
      if (!existing) return NextResponse.json({ error: "La locación no existe." }, { status: 404 });
      if (fields.parentId === id) return NextResponse.json({ error: "Una locación no puede ser su propio padre." }, { status: 400 });
      const parentError = await validateParentChain(fields.parentId, id);
      if (parentError) return NextResponse.json({ error: parentError }, { status: 400 });

      const location = await Location.where({ id }).update(fields);
      await recordAuditEvent({
        actorUserId: Number(admin.id), action: "WORLD_LOCATION_UPDATE", entityType: "WORLD_LOCATION", entityId: id,
        details: { name: fields.name, type: fields.type, parentId: fields.parentId, publicationStatus: fields.publicationStatus },
      });
      return NextResponse.json({ location });
    }

    if (action !== "create") return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
    const parentError = await validateParentChain(fields.parentId);
    if (parentError) return NextResponse.json({ error: parentError }, { status: 400 });

    const location = await Location.create(fields);
    await recordAuditEvent({
      actorUserId: Number(admin.id), action: "WORLD_LOCATION_CREATE", entityType: "WORLD_LOCATION", entityId: Number(location.id),
      details: { name: fields.name, type: fields.type, parentId: fields.parentId, publicationStatus: fields.publicationStatus },
    });
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    console.error("WORLD_LOCATION_SAVE_ERROR", error);
    return NextResponse.json({ error: "No se pudo guardar la locación." }, { status: 500 });
  }
}
