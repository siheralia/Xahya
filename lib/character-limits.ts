import { salaryRest } from "@/lib/role-salary";

type Actor={id:number;role:string};
export const DEFAULT_CHARACTER_LIMIT=3;
export async function getCharacterLimit(actor:Actor):Promise<number|null>{
 if(actor.role==="ADMIN"||actor.role==="GM")return null;
 if(actor.role==="SYSTEM"||actor.role==="BANNED")return 0;
 try{
  const [assignments,roles]=await Promise.all([
   salaryRest("UserManagedRole?userId=eq."+actor.id+"&select=roleId"),
   salaryRest("ManagedRole?select=id,permissions"),
  ]);
  const assigned=new Set(assignments.map((row:any)=>Number(row.roleId)));
  const limits=roles.filter((r:any)=>assigned.has(Number(r.id))).map((r:any)=>{
   const raw=r.permissions?.__characterLimit?.[0];
   return typeof raw==="string"&&/^\d+$/.test(raw)?Number(raw):null;
  }).filter((n:any):n is number=>n!==null&&Number.isSafeInteger(n)&&n>=0);
  return limits.length?Math.max(DEFAULT_CHARACTER_LIMIT,...limits):DEFAULT_CHARACTER_LIMIT;
 }catch{return DEFAULT_CHARACTER_LIMIT;}
}
