"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CharacterOption={id:number;name:string;mine:boolean};
type LaunchOptions={characters:CharacterOption[];canApprovePvP:boolean;
 canUseTimelineV2?:boolean};
export default function DuelLauncher({initialCharacterId}:{initialCharacterId:string}) {
 const router=useRouter();
 const [options,setOptions]=useState<LaunchOptions|null>(null);
 const [characterId,setCharacterId]=useState(initialCharacterId);
 const [opponentCharacterId,setOpponentCharacterId]=useState("");
 const [npcDifficulty,setNpcDifficulty]=useState("INTERMEDIATE");
 const [useTimelineV2,setUseTimelineV2]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  (async()=>{
   try {
    const response=await fetch("/api/combat/duels",{cache:"no-store"});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error??"No se pudieron cargar tus personajes.");
    if(!live)return;
    const fetched=payload as LaunchOptions;
    setOptions(fetched);
    // Honor characterId from the sheet only if the server allows it.
    // Otherwise prefer the user's own character even for administrators.
    const initial=fetched.characters.find(c=>String(c.id)===initialCharacterId);
    const selected=initial??fetched.characters.find(c=>c.mine)??fetched.characters[0];
    setCharacterId(selected?String(selected.id):"");
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudieron cargar tus personajes.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[initialCharacterId]);
 async function start() {
  if(!options || !characterId || busy)return;
  setBusy(true);setError("");
  try {
   const resp=await fetch("/api/combat/duels",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({characterId:Number(characterId),
      opponentCharacterId:options.canApprovePvP&&opponentCharacterId?Number(opponentCharacterId):undefined,
      npcDifficulty:options.canApprovePvP&&opponentCharacterId?undefined:npcDifficulty,
      combatTimelineVersion:options.canUseTimelineV2&&opponentCharacterId&&useTimelineV2?2:1})
   });
   const data=await resp.json();
   if(!resp.ok)throw new Error(data.error??"No fue posible iniciar el combate");
   router.push("/combat/"+data.id+(data.timelineV2?"/timeline":""));
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}
  finally{setBusy(false);}
 }
 const availableOpponents=options?.characters.filter(c=>String(c.id)!==characterId)??[];
 return <main className="mx-auto max-w-2xl px-4 py-10 text-zinc-100">
  <div className="mb-7 flex items-center justify-between"><h1 className="text-3xl font-bold">⚔️ Combate</h1><Link href="/" className="text-sm text-cyan-300">Inicio</Link></div>
  <p className="mb-5 text-zinc-400">Entrena contra NPC de dificultad configurable, con una raza, todos sus perks raciales, tres perks adicionales y habilidades del catálogo público. Sus estadísticas y recursos existen solo durante el encuentro.</p>
  <div className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
   <label className="block text-sm">Tu personaje
    <select value={characterId} disabled={busy||loading} onChange={e=>{setCharacterId(e.target.value);setOpponentCharacterId("");}}
     className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
     {loading&&<option value="">Cargando personajes…</option>}
     {!loading&&!options?.characters.length&&<option value="">No tienes personajes disponibles</option>}
     {options?.characters.map(c=><option key={c.id} value={c.id}>{c.name}{c.mine?"":" · Otro jugador"}</option>)}
    </select>
   </label>
   {options?.canApprovePvP&&<label className="block text-sm">Oponente (combate entre personajes autorizado)
    <select value={opponentCharacterId} disabled={busy||!availableOpponents.length}
      onChange={e=>setOpponentCharacterId(e.target.value)}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
      <option value="">NPC de entrenamiento</option>
      {availableOpponents.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    <span className="mt-1 block text-xs text-zinc-400">Este selector solo aparece para quienes pueden aprobar combates PvP.</span>
   </label>}
   {options?.canUseTimelineV2&&!!opponentCharacterId&&<label className="flex items-start gap-3 rounded-xl border border-cyan-700/40 bg-cyan-950/20 p-3 text-sm">
    <input type="checkbox" checked={useTimelineV2} disabled={busy}
      onChange={e=>setUseTimelineV2(e.target.checked)} className="mt-1" />
    <span><strong>Probar combate continuo V2 (experimental, solo GM)</strong>
     <span className="mt-1 block text-xs text-zinc-400">Solo para esta partida nueva PvP. Su reloj, invocaciones y reacciones utilizan ticks absolutos. Algunas categorías avanzadas siguen bloqueadas; no modifica los combates anteriores.</span>
    </span>
   </label>}
   {!(options?.canApprovePvP&&opponentCharacterId)&&<label className="block text-sm">Dificultad del NPC
    <select value={npcDifficulty} disabled={busy||loading} onChange={e=>setNpcDifficulty(e.target.value)}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
      <option value="BASIC">Básico · aprender acciones</option>
      <option value="INTERMEDIATE">Intermedio · combate equilibrado</option>
      <option value="ADVANCED">Avanzado · mejores defensas</option>
      <option value="ENDURANCE">Resistencia · grandes cantidades de HP</option>
      <option value="AGGRESSIVE">Agresivo · presión constante y habilidades</option>
    </select>
    <span className="mt-1 block text-xs text-zinc-400">El NPC hereda sus perks raciales y sortea tres perks generales con probabilidad mayor que 0%, sin repetir. Algunos perks generales no tienen efectos aplicables al combate.</span>
   </label>}
   {error&&<p role="alert" className="text-rose-400">{error}</p>}
   <button type="button" onClick={()=>void start()} disabled={busy||loading||!characterId}
    className="rounded-lg bg-cyan-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
    {busy?"Iniciando…":"Iniciar combate"}
   </button>
  </div>
  <p className="mt-5 text-xs text-zinc-500">El combate no descuenta HP ni maná persistentes de la ficha. La persistencia de consumibles y durabilidad de armas continúa pendiente.</p>
 </main>;
}
