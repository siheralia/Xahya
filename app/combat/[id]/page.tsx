import {redirect} from "next/navigation";
import {db} from "@/lib/db";
import CombatEncounter from "./CombatEncounter";

export default async function CombatEncounterPage({params}:{
 params:Promise<{id:string}>
}){
 const {id}=await params;
 const encounterId=Number(id);
 if(Number.isSafeInteger(encounterId)&&encounterId>0){
   const Session=(db.orm.public as any).CombatSession;
   const row=await Session.where({id:encounterId}).first();
   if((row?.lastAction as any)?.combatTimelineV2?.version===2)
     redirect("/combat/"+id+"/timeline");
 }
 return <CombatEncounter id={id}/>;
}
