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
  return users.find((entry: any) => entry.clerkId === clerkId && String(entry.role) === "ADMIN") ?? null;
}
const models = {
  occupation: { model: "WorldOccupation", entity: "WORLD_OCCUPATION", label: "ocupación" },
  socialClass: { model: "WorldSocialClass", entity: "WORLD_SOCIAL_CLASS", label: "clase social" },
} as const;
type CatalogType = keyof typeof models;

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar los catálogos del mundo." }, { status: 403 });
  try {
    const [occupations, socialClasses] = await Promise.all([
      (db.orm.public as any).WorldOccupation.all(),
      (db.orm.public as any).WorldSocialClass.all(),
    ]);
    const sort = (a: any, b: any) => String(a.name).localeCompare(String(b.name), "es");
    return NextResponse.json({
      occupations: occupations.sort(sort),
      socialClasses: socialClasses.sort(sort),
    });
  } catch (error) {
    console.error("WORLD_POPULATION_CATALOGS_GET_ERROR", error);
    return NextResponse.json({ error: "No se pudieron cargar los catálogos. Verifica que la migración de catálogos esté aplicada y que el contrato Prisma esté generado." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Solo ADMIN puede gestionar los catálogos del mundo." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const type = String(body?.type ?? "") as CatalogType;
  if (!(type in models)) return NextResponse.json({ error: "Tipo de catálogo inválido." }, { status: 400 });
  const config = models[type];
  const Catalog = (db.orm.public as any)[config.model];
  const action = String(body?.action ?? "create");
  try {
    if (action === "delete") {
      const id = Number(body?.id);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
      const entry = await Catalog.where({ id }).first();
      if (!entry) return NextResponse.json({ error: "El registro no existe." }, { status: 404 });
      const Cohort = (db.orm.public as any).PopulationCohort;
      const foreignKey = type === "occupation" ? "occupationId" : "socialClassId";
      const linkedCohorts = (await Cohort.all()).filter((cohort: any) => Number(cohort[foreignKey]) === id);
      if (linkedCohorts.length > 0) {
        return NextResponse.json({ error: "Este registro está vinculado a " + linkedCohorts.length + " cohorte(s). Márcalo como inactivo para conservar la integridad histórica." }, { status: 409 });
      }
      await Catalog.where({ id }).delete();
      await recordAuditEvent({ actorUserId: Number(admin.id), action: config.entity + "_DELETE", entityType: config.entity, entityId: id, details: { name: entry.name } });
      return NextResponse.json({ success: true });
    }
    const name = String(body?.name ?? "").trim();
    const description = String(body?.description ?? "").trim() || null;
    if (!name || name.length > 120) return NextResponse.json({ error: "El nombre es obligatorio y no puede superar 120 caracteres." }, { status: 400 });
    if (description && description.length > 1000) return NextResponse.json({ error: "La descripción no puede superar 1000 caracteres." }, { status: 400 });
    const active = body?.active !== false;
    if (action === "update") {
      const id = Number(body?.id);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
      const existing = await Catalog.where({ id }).first();
      if (!existing) return NextResponse.json({ error: "El registro no existe." }, { status: 404 });
      const updated = await Catalog.where({ id }).update({ name, description, active });
      await recordAuditEvent({ actorUserId: Number(admin.id), action: config.entity + "_UPDATE", entityType: config.entity, entityId: id, details: { name } });
      return NextResponse.json({ entry: updated });
    }
    if (action !== "create") return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
    const created = await Catalog.create({ name, description, active });
    await recordAuditEvent({ actorUserId: Number(admin.id), action: config.entity + "_CREATE", entityType: config.entity, entityId: Number(created.id), details: { name } });
    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el catálogo.";
    if (/unique|duplicate/i.test(message)) return NextResponse.json({ error: "Ya existe un registro con ese nombre en este catálogo." }, { status: 409 });
    console.error("WORLD_POPULATION_CATALOGS_POST_ERROR", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
