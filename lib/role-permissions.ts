import { salaryRest } from "@/lib/role-salary";

export const ROLE_PERMISSIONS = {
 "management.characters": ["view", "edit"],
 "management.users": ["view", "view-email", "edit"],
 "management.roles": ["view", "edit"],
 "management.global-delivery": ["view", "grant"],
 "management.character-details": ["view", "edit"],
 "management.character-resources": ["view", "grant"],
 "management.skills": ["view", "approve", "reject", "edit"],
 "management.items": ["view", "create", "edit", "delete", "grant"],
 "management.labyrinth": ["view", "edit", "operate"],
 "management.finances": ["view", "adjust", "audit"],
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
  Array.isArray(actions) && actions.length<=10 &&
  actions.every(action=>typeof action==="string" && (action==="*" || (page!=="*" && (ROLE_PERMISSIONS[page as keyof typeof ROLE_PERMISSIONS] as readonly string[]).includes(action)))));
}
export async function hasRolePermission(actor:Actor|null,page:string,action:string):Promise<boolean>{
 if(!actor||["SYSTEM","BANNED"].includes(String(actor.role)))return false;
 if(actor.role==="ADMIN")return true;
 // Existing GM abilities remain valid during migration to configurable permissions.
 if(actor.role==="GM"&&page==="management.characters"&&action==="view")return true;
 const [assignments,roles]=await Promise.all([
  salaryRest("UserManagedRole?userId=eq."+actor.id+"&select=roleId") as Promise<Assignment[]>,
  salaryRest("ManagedRole?select=id,permissions") as Promise<Role[]>,
 ]);
 const assigned=new Set(assignments.map(a=>a.roleId));
 return roles.some(role=>assigned.has(role.id)&&permits(role.permissions,page,action));
}
