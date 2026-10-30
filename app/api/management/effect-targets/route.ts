import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEffectTargets } from "@/lib/effects/catalog";
import { readManagedEffectCatalog } from "@/lib/effects/managed-catalog";
import { readStatisticsCatalog } from "@/lib/stats/dynamic";
import { hasRolePermission } from "@/lib/role-permissions";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db.orm.public.User.all();
  const user = users.find((entry) => entry.clerkId === userId);
  if (!user || !(await hasRolePermission(user, "management.items", "view") || await hasRolePermission(user, "management.effects", "view") || await hasRolePermission(user, "management.perks", "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const statistics = (await readStatisticsCatalog()).filter((stat) => stat.active !== false);
  const catalog = await readManagedEffectCatalog();
  return NextResponse.json({ statistics, effects: catalog.effects.map(({type,label,mode,description}) => ({ type, label, mode, description, targets: resolveEffectTargets(type, statistics) })) });
}
