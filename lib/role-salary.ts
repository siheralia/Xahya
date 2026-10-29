import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const base = () => process.env.SUPABASE_URL?.replace(/\/$/, "") + "/rest/v1/";
const headers = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY!,
  "Content-Type": "application/json",
});
export async function currentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const users = await db.orm.public.User.all();
  return users.find(u => u.clerkId === userId) ?? null;
}
export function isAdmin(user: {role: string} | null) {
  return user != null && String(user.role) === "ADMIN";
}
export async function salaryRest(path: string, init: RequestInit = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Salary database not configured");
  const response = await fetch(base() + path, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Salary database error");
  return data;
}
export function badRequest(error: unknown) {
  console.error("SALARY API ERROR", error);
  return NextResponse.json({error: "No se pudo completar la operación."}, {status:500});
}
export function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
}
