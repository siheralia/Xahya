import CombatEncounter from "./CombatEncounter";
import CombatV2Encounter from "./CombatV2Encounter";
import {db} from "@/lib/db";
export default async function CombatEncounterPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 const numeric=Number(id);
 if(Number.isSafeInteger(numeric)&&numeric>0){
   const Session=(db.orm.public as any).CombatSession;
   const session=await Session.where({id:numeric}).first();
   if((session?.lastAction as any)?.combatV2?.version===2)
     return <CombatV2Encounter id={id}/>;
 }
 return <CombatEncounter id={id}/>;
}
