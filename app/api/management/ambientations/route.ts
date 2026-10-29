import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const endpoint = () => process.env.SUPABASE_URL + "/rest/v1/seasonal_ambientations";
const headers = () => ({ apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY!, "Content-Type": "application/json" });
async function allowed() {
 const { userId } = await auth();
 if (!userId) return false;
 const users = await db.orm.public.User.all();
 return users.some(u => u.clerkId === userId && ["GM","ADMIN"].includes(String(u.role)));
}
export async function GET() {
 if (!(await allowed())) return NextResponse.json({error:"Forbidden"},{status:403});
 const r = await fetch(endpoint()+"?select=*&order=created_at.desc", {headers:headers(),cache:"no-store"});
 return NextResponse.json(await r.json(),{status:r.status});
}
export async function POST(request:Request) {
 if (!(await allowed())) return NextResponse.json({error:"Forbidden"},{status:403});
 const body = await request.json().catch(()=>null);
 const name = String(body?.name??"").trim().slice(0,100);
 if (!name) return NextResponse.json({error:"Nombre obligatorio"},{status:400});
 const r = await fetch(endpoint(),{method:"POST",headers:{...headers(),Prefer:"return=representation"},body:JSON.stringify({name,layers:[]})});
 return NextResponse.json(await r.json(),{status:r.status});
}
export async function PATCH(request:Request) {
 if (!(await allowed())) return NextResponse.json({error:"Forbidden"},{status:403});
 const body = await request.json().catch(()=>null);
 if (!/^[0-9a-f-]{36}$/i.test(String(body?.id))) return NextResponse.json({error:"ID inválido"},{status:400});
 const layers = body.layers;
 if (!Array.isArray(layers) || layers.length>20 || layers.some(l => !l || typeof l.id!=="string" || !/^https:\/\/[\w.-]+\//.test(String(l.imageUrl)) || !["top-left","top-right","bottom-left","bottom-right"].includes(l.position) || !["none","float","swing","pulse","fall"].includes(l.animation) || !Number.isFinite(l.width) || l.width<30 || l.width>360 || !Number.isFinite(l.opacity) || l.opacity<0 || l.opacity>100)) return NextResponse.json({error:"Capas inválidas"},{status:400});
 const enabled = body.enabled === true;
 const starts_at = body.starts_at || null, ends_at = body.ends_at || null;
 if ((starts_at && !Number.isFinite(Date.parse(starts_at))) || (ends_at && !Number.isFinite(Date.parse(ends_at))) || (starts_at && ends_at && Date.parse(starts_at)>=Date.parse(ends_at))) return NextResponse.json({error:"Fechas inválidas"},{status:400});
 if (enabled) {
   const clear = await fetch(endpoint()+"?enabled=eq.true",{method:"PATCH",headers:headers(),body:JSON.stringify({enabled:false})});
   if (!clear.ok) return NextResponse.json({error:"No se pudo desactivar la ambientación anterior"},{status:500});
 }
 const r = await fetch(endpoint()+"?id=eq."+body.id,{method:"PATCH",headers:{...headers(),Prefer:"return=representation"},body:JSON.stringify({name:String(body.name??"").trim().slice(0,100),enabled,starts_at,ends_at,layers,updated_at:new Date().toISOString()})});
 return NextResponse.json(await r.json(),{status:r.status});
}
