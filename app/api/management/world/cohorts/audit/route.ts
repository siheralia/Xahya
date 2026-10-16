import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((entry: any) => entry.clerkId === clerkId && String(entry.role) === "ADMIN") ?? null;
}

/**
 * Read-only structural audit. It deliberately does not mutate cohorts or infer
 * a social distribution from an aggregate city record.
 */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Solo ADMIN puede auditar las cohortes." }, { status: 403 });
  }

  try {
    const Cohort = (db.orm.public as any).PopulationCohort;
    const Location = (db.orm.public as any).WorldLocation;
    const [cohorts, locations] = await Promise.all([Cohort.all(), Location.all()]);

    const active = cohorts.filter((cohort: any) => cohort.active !== false);
    const byLocation = new Map<number, any[]>();
    for (const cohort of active) {
      const id = Number(cohort.locationId);
      const list = byLocation.get(id) ?? [];
      list.push(cohort);
      byLocation.set(id, list);
    }

    const results = locations
      .filter((location: any) => location.publicationStatus !== "ARCHIVED")
      .map((location: any) => {
        const local = byLocation.get(Number(location.id)) ?? [];
        const population = local.reduce((sum: bigint, cohort: any) => sum + BigInt(cohort.population ?? 0), BigInt(0));
        const wealth = local.reduce((sum: bigint, cohort: any) => sum + BigInt(cohort.wealth ?? 0), BigInt(0));
        const signatures = new Map<string, number>();
        for (const cohort of local) {
          const signature = [
            Number(cohort.raceId ?? 0),
            Number(cohort.occupationId ?? 0),
            Number(cohort.socialClassId ?? 0),
            String(cohort.ageGroup ?? "").trim().toLocaleLowerCase("es"),
          ].join("|");
          signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
        }
        const duplicateProfiles = Array.from(signatures.values()).filter((count) => count > 1).length;
        return {
          locationId: Number(location.id),
          locationName: String(location.name),
          cohortCount: local.length,
          population: population.toString(),
          wealth: wealth.toString(),
          status: local.length === 0 ? "NO_ACTIVE_COHORTS" : local.length === 1 ? "SINGLE_COHORT_REVIEW" : "MULTIPLE_COHORTS",
          duplicateProfiles,
        };
      })
      .sort((a: any, b: any) => a.locationName.localeCompare(b.locationName, "es"));

    const totalPopulation = active.reduce((sum: bigint, cohort: any) => sum + BigInt(cohort.population ?? 0), BigInt(0));
    const totalWealth = active.reduce((sum: bigint, cohort: any) => sum + BigInt(cohort.wealth ?? 0), BigInt(0));

    return NextResponse.json({
      readOnly: true,
      auditedAt: new Date().toISOString(),
      totals: {
        locationsAudited: results.length,
        activeCohorts: active.length,
        inactiveCohorts: cohorts.length - active.length,
        population: totalPopulation.toString(),
        wealth: totalWealth.toString(),
        locationsWithoutActiveCohorts: results.filter((entry: any) => entry.status === "NO_ACTIVE_COHORTS").length,
        locationsWithSingleActiveCohort: results.filter((entry: any) => entry.status === "SINGLE_COHORT_REVIEW").length,
        locationsWithMultipleActiveCohorts: results.filter((entry: any) => entry.status === "MULTIPLE_COHORTS").length,
        duplicateProfileLocations: results.filter((entry: any) => entry.duplicateProfiles > 0).length,
      },
      interpretation: {
        SINGLE_COHORT_REVIEW: "No demuestra un error: revisar si la fila representa una población agregada o un grupo social.",
        MULTIPLE_COHORTS: "Verificar que las cohortes sean grupos poblacionales disjuntos y que sus sumas coincidan con la población de la locación.",
        NO_ACTIVE_COHORTS: "La locación no tiene población representada mediante cohortes activas.",
        duplicateProfiles: "Perfiles con la misma raza, ocupación, clase social y edad; podrían ser duplicados, aunque nombres o comportamiento distintos pueden justificar su separación.",
      },
      locations: results,
    });
  } catch (error) {
    console.error("WORLD_COHORT_AUDIT_ERROR", error);
    return NextResponse.json({ error: "No se pudo auditar la estructura de cohortes. Verifica que las migraciones de población estén aplicadas." }, { status: 500 });
  }
}
