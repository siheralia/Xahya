import { salaryRest } from "@/lib/role-salary";

export const ROLE_PERMISSIONS = {
 "management.characters": ["view", "edit", "delete", "transfer"],
 "management.users": ["view", "view-email", "edit", "assign-roles", "delete"],
 "management.roles": ["view", "create", "edit", "delete"],
 "management.global-delivery": ["view", "grant"],
 "management.character-details": ["view", "edit", "change-race"],
 "management.character-resources": ["view", "grant"],
 "management.skills": ["view", "approve", "reject", "edit"],
 "management.items": ["view", "view-properties", "view-system", "view-event", "view-quest", "view-ability", "create", "edit", "delete", "grant", "create-event", "edit-event", "delete-event", "grant-event", "create-quest", "edit-quest", "delete-quest", "grant-quest", "create-ability", "edit-ability", "delete-ability", "grant-ability"],
 "management.labyrinth": ["view", "edit", "operate"],
 "management.finances": ["view", "adjust", "audit"],
 "management.statistics": ["view", "edit"],
 "management.effects": ["view", "create", "edit", "delete"],
 "management.races": ["view", "create", "edit", "delete"],
 "management.enemies": ["view", "create", "edit", "delete"],
 "management.ambientations": ["view", "edit"],
 "management.themes": ["view", "edit"],
 "management.store": ["view", "edit"],
 "management.businesses": ["view", "edit"],
 "management.world": ["view", "edit"],
 "management.perks": ["view", "edit"],
 "management.rules": ["view", "edit"],
 "management.rankings": ["view", "edit"],
 "management.casino": ["view", "edit"],
 "management.social": ["view", "edit"],
 "management.logs": ["view"],
} as const;

type Actor={id:number;role:string};
type Role={id:number;permissions:unknown};
type Assignment={roleId:number};
export function permits(permissions:unknown, page:string, action:string):boolean {
 if(!permissions || typeof permissions!=="object" || Array.isArray(permissions))return false;
 const p=permissions as Record<string,unknown>;
 const entries=[p["*"],p[page]];
 return entries.some(value=>Array.isArray(value)&&value.every(v=>typeof v==="string")&&(value.includes("*")||value.includes(action)));
}
export function validPermissions(value:unknown):value is Record<string,string[]>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 return Object.entries(value).every(([page,actions])=>
  (page==="*" || Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS,page)) &&
  Array.isArray(actions) && actions.length<=40 &&
  actions.every(action=>typeof action==="string" && (action==="*" || (page!=="*" && (ROLE_PERMISSIONS[page as keyof typeof ROLE_PERMISSIONS] as readonly string[]).includes(action)))));
}
export async function hasRolePermission(actor:Actor|null,page:string,action:string):Promise<boolean>{
 if(!actor||["SYSTEM","BANNED"].includes(String(actor.role)))return false;
 if(actor.role==="ADMIN")return true;
 const [assignments,roles]=await Promise.all([
  salaryRest("UserManagedRole?userId=eq."+actor.id+"&select=roleId") as Promise<Assignment[]>,
  salaryRest("ManagedRole?select=id,permissions") as Promise<Role[]>,
 ]);
 const assigned=new Set(assignments.map(a=>a.roleId));
 return roles.some(role=>assigned.has(role.id)&&permits(role.permissions,page,action)) && (action==="view" || roles.some(role=>assigned.has(role.id)&&permits(role.permissions,page,"view")));
}

export function itemOriginPermission(acquisitionType: unknown, action: "create" | "edit" | "delete" | "grant"): string | null {
 const suffix: Record<string,string> = { EVENT: "event", QUEST: "quest", ABILITY_GENERATED: "ability" };
 const origin = suffix[String(acquisitionType)];
 return origin ? action + "-" + origin : null;
}

export async function canManageItemOrigin(actor: Actor | null, acquisitionType: unknown, action: "create" | "edit" | "delete" | "grant"): Promise<boolean> {
 const scoped = itemOriginPermission(acquisitionType, action);
 return await hasRolePermission(actor, "management.items", action) || (scoped !== null && await hasRolePermission(actor, "management.items", scoped));
}
