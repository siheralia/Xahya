import { NextResponse } from "next/server";
import { currentUser } from "@/lib/role-salary";
import { ROLE_PERMISSIONS, hasRolePermission } from "@/lib/role-permissions";

export async function GET() {
 const actor = await currentUser();
 if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 const pages = Object.keys(ROLE_PERMISSIONS);
 const allowed = await Promise.all(pages.map(page => hasRolePermission(actor, page, "view")));
 const actions = Object.fromEntries(await Promise.all(pages.map(async page => [page, (await Promise.all(ROLE_PERMISSIONS[page as keyof typeof ROLE_PERMISSIONS].map(async action => await hasRolePermission(actor, page, action) ? action : null))).filter(Boolean)])));
 return NextResponse.json({ pages: pages.filter((_, index) => allowed[index]), actions });
}
