import DuelLauncher from "./DuelLauncher";

export default async function CombatPage({searchParams}:{
  searchParams:Promise<{characterId?:string}>
}) {
  const params=await searchParams;
  return <DuelLauncher initialCharacterId={params.characterId??""}/>;
}
