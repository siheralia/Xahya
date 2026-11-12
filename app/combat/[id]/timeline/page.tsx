import TimelineEncounter from "./TimelineEncounter";
export default async function TimelineEncounterPage({
 params,
}:{params:Promise<{id:string}>}){
 const {id}=await params;
 return <TimelineEncounter id={id}/>;
}
