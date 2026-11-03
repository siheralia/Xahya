"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DuelLauncher({initialCharacterId}:{initialCharacterId:string}) {
 const router=useRouter();
 const [characterId,setCharacterId]=useState(initialCharacterId);
 const [opponentCharacterId,setOpponentCharacterId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function start() {
  setBusy(true);setError("");
  try {
   const resp=await fetch("/api/combat/duels",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({characterId:Number(characterId),
      opponentCharacterId:opponentCharacterId.trim()?Number(opponentCharacterId):undefined})
   });
   const data=await resp.json();
   if(!resp.ok)throw new Error(data.error??"No fue posible iniciar el combate");
   router.push("/combat/"+data.id);
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-2xl px-4 py-10 text-zinc-100">
  <div className="mb-7 flex items-center justify-between"><h1 className="text-3xl font-bold">⚔️ Combate</h1><Link href="/" className="text-sm text-cyan-300">Inicio</Link></div>
  <p className="mb-5 text-zinc-400">Prueba el motor de 100 ticks por turno, reacciones elegibles y trayectorias dibujadas. Puedes iniciar un entrenamiento contra un NPC. Un GM también puede abrir un enfrentamiento entre dos personajes registrados.</p>
  <div className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
   <label className="block text-sm">ID del personaje
    <input value={characterId} onChange={e=>setCharacterId(e.target.value)} type="number" min="1"
     className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"/>
   </label>
   <label className="block text-sm">ID del oponente (opcional, solo GM)
    <input value={opponentCharacterId} onChange={e=>setOpponentCharacterId(e.target.value)} type="number" min="1"
     placeholder="Vacío para entrenamiento contra NPC"
     className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"/>
   </label>
   {error&&<p role="alert" className="text-rose-400">{error}</p>}
   <button type="button" onClick={start} disabled={busy||!characterId}
    className="rounded-lg bg-cyan-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
    {busy?"Iniciando...":"Iniciar combate"}
   </button>
  </div>
  <p className="mt-5 text-xs text-zinc-500">Los combates de esta versión guardan los HP y la integridad del arma durante el encuentro. Todavía no descuentan el HP global de la ficha ni ejecutan habilidades de coste de maná.</p>
 </main>;
}
