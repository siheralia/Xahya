import {auth} from "@clerk/nextjs/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";

export async function authorizedMaterialUser(action:"view"|"create"|"edit"|"delete"){
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(entry=>entry.clerkId===userId);
 if(!user)return null;
 const ok=await hasRolePermission(user,"management.materials",action)
  ||await hasRolePermission(user,"management.items",action);
 return ok?user:null;
}
