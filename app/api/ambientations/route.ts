import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ layers: [] });
  try {
    const response = await fetch(url + "/rest/v1/seasonal_ambientations?enabled=eq.true&select=layers,starts_at,ends_at&limit=1", {
      headers: { apikey: key, Authorization: "Bearer " + key }, cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ layers: [] });
    const rows = await response.json();
    const entry = rows[0];
    const now = Date.now();
    if (!entry || (entry.starts_at && Date.parse(entry.starts_at) > now) || (entry.ends_at && Date.parse(entry.ends_at) <= now)) {
      return NextResponse.json({ layers: [] });
    }
    return NextResponse.json({ layers: Array.isArray(entry.layers) ? entry.layers : [] });
  } catch {
    return NextResponse.json({ layers: [] });
  }
}
