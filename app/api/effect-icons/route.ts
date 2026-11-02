import { NextResponse } from "next/server";
import { readManagedEffectCatalog } from "@/lib/effects/managed-catalog";
import { catalogEffectIcons } from "@/lib/skills/emblem-icons";

export async function GET() {
  try {
    const {effects,narrativeCards} = await readManagedEffectCatalog();
    return NextResponse.json({
      icons: catalogEffectIcons(effects,narrativeCards),
    }, {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"No se pudieron cargar los iconos"},{status:500});
  }
}
