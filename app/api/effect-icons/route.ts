import { NextResponse } from "next/server";
import { readManagedEffectCatalog } from "@/lib/effects/managed-catalog";
export async function GET() {
 try {
  const {effects}=await readManagedEffectCatalog();
  return NextResponse.json({icons:Object.fromEntries(effects.map(effect=>[effect.type,effect.icon]))},{headers:{"Cache-Control":"no-store"}});
 } catch {return NextResponse.json({error:"No se pudieron cargar los iconos"},{status:500});}
}
