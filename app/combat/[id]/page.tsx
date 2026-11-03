import CombatEncounter from "./CombatEncounter";
export default async function CombatEncounterPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 return <CombatEncounter id={id}/>;
}
