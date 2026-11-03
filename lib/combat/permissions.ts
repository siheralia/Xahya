import { hasRolePermission } from "@/lib/role-permissions";

type CombatModerator={id:number;role:string};

/**
 * Allows base ADMIN/GM users and configurable role holders to approve and
 * operate PvP sessions. Owners can still control only their own characters
 * through the ordinary combat action authorization.
 */
export async function canApproveCombat(actor:CombatModerator):Promise<boolean> {
 return ["ADMIN","GM"].includes(String(actor.role))
   || await hasRolePermission(actor,"management.combat","approve");
}
