"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import MazeMap from "@/components/MazeMap";

export default function MazeManagement(){
 const [mazes,setMazes]=useState<any[]>([]);const [isAdmin,setIsAdmin]=useState(false);const [mazeAction,setMazeAction]=useState<number|null>(null);const [name,setName]=useState("");const [description,setDescription]=useState("");const [type,setType]=useState("INFINITE");const [generationMode,setGenerationMode]=useState("FREE_3D");const [maxRooms,setMaxRooms]=useState(20);const [selected,setSelected]=useState<any>(null);const [error,setError]=useState("");
 async function load(){try{const r=await fetch("/api/maze");const text=await r.text();const d=text?JSON.parse(text):null;if(!r.ok)throw new Error(d?.error??"No se pudo cargar.");setMazes(Array.isArray(d)?d:[]);}catch(e){setError(e instanceof Error?e.message:"No se pudo cargar.");}}
 useEffect(()=>{load();fetch("/api/management/characters").then(r=>r.json()).then(d=>setIsAdmin(Boolean(d?.isAdmin))).catch(()=>{});},[]);
 async function create(){setError("");try{const r=await fetch("/api/maze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description,mazeType:type,generationMode,maxRooms})});const text=await r.text();const d=text?JSON.parse(text):null;if(!r.ok)throw new Error(d?.error??"No se pudo crear.");setName("");setDescription("");await load();}catch(e){setError(e instanceof Error?e.message:"No se pudo crear el laberinto.");}}
 async function inspect(id:number){const r=await fetch("/api/maze/"+id);const d=await r.json();if(r.ok)setSelected(d);}
 async function mazeControl(mazeId:number,action:"releasePlayer"|"deactivateTrap",roomId:number,characterId?:number){
  setError("");
  try{
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,roomId,characterId})});
    const d=await r.json();
    if(!r.ok)throw new Error(d?.error??"No se pudo completar la acción.");
    await inspect(mazeId); await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo completar la acción.");}
 }
 async function reloadEnemies(id:number){setError("");try{const r=await fetch("/api/maze/"+id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reloadEnemies"})});const d=await r.json();if(!r.ok)throw new Error(d?.error??"No se pudieron recargar los enemigos.");await inspect(id);await load();}catch(e){setError(e instanceof Error?e.message:"No se pudieron recargar los enemigos.");}}
 async function mazeActionRequest(id:number,action:"resetMaze"|"deleteMaze"){
  if(!isAdmin)return;
  const maze=mazes.find(m=>Number(m.id)===Number(id));
  const label=maze?.name??"este laberinto";
  const message=action==="resetMaze"
    ? "¿Resetear \""+label+"\"? Se borrarán todas las habitaciones descubiertas, posiciones y encuentros, y se creará una nueva habitación inicial."
    : "¿BORRAR \""+label+"\" permanentemente? Esta acción no se puede deshacer.";
  if(!window.confirm(message))return;
  setMazeAction(id);setError("");
  try{
    const r=await fetch("/api/maze/"+id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
    const d=await r.json();
    if(!r.ok)throw new Error(d?.error??"No se pudo completar la acción.");
    setSelected(null);await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo completar la acción.");}
  finally{setMazeAction(null);}
 }
 async function clear(roomId:number){const r=await fetch("/api/management/maze/rooms/"+roomId+"/clear",{method:"POST"});if(!r.ok){const d=await r.json();setError(d?.error??"No se pudo limpiar.");return;}if(selected)await inspect(selected.maze.id);await load();}
 return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8"><div className="flex justify-between gap-4"><div><h1 className="text-4xl font-bold">Gestión de laberintos</h1><p className="mt-2 text-zinc-500">GM y ADMIN.</p></div><Link href="/management" className="rounded-lg border border-zinc-700 px-4 py-2">← Gestión</Link></div>{error&&<p className="mt-5 text-red-300">{error}</p>}<section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Crear laberinto</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"/><select value={type} onChange={e=>setType(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"><option value="INFINITE">Infinito</option><option value="FINITE">Finito</option></select><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 md:col-span-2"/><label className="text-sm text-zinc-400">Estructura<select value={generationMode} onChange={e=>setGenerationMode(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"><option value="FREE_3D">Libre — 3D (actual)</option><option value="PLANAR_2D">2D — sin arriba/abajo</option><option value="LINEAR">Pasillo lineal</option><option value="SPIRAL_TOWER">Torre espiral</option></select></label>{type==="FINITE"&&<input type="number" min={2} value={maxRooms} onChange={e=>setMaxRooms(Math.max(2,Number(e.target.value)||2))} placeholder="Máximo de habitaciones" className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"/>}</div><button onClick={create} className="mt-4 rounded-lg bg-white px-5 py-3 font-medium text-black">Crear</button></section><section className="mt-8 grid gap-3">{mazes.map(m=><button key={m.id} onClick={()=>inspect(m.id)} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left"><div className="flex justify-between gap-3"><span className="font-semibold">{m.name}</span><span className="text-sm text-zinc-500">{m.status}</span></div><p className="mt-2 text-sm text-zinc-500">{m.mazeType==="FINITE"?m.roomCount+"/"+m.maxRooms:"∞"} habitaciones · {({FREE_3D:"3D libre",PLANAR_2D:"2D",LINEAR:"Lineal",SPIRAL_TOWER:"Torre espiral"} as any)[m.generationMode??"FREE_3D"]??"3D libre"}</p></button>)}</section>{selected&&<section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{selected.maze.name}</h2><p className="mt-1 text-xs text-zinc-500">Mapa visual: habitaciones generadas y sus conexiones.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>reloadEnemies(selected.maze.id)} disabled={mazeAction!==null} className="rounded-lg border border-amber-900/70 px-3 py-2 text-xs text-amber-300">Recargar enemigos</button>{isAdmin&&<><button onClick={()=>mazeActionRequest(selected.maze.id,"resetMaze")} disabled={mazeAction!==null} className="rounded-lg border border-orange-900/70 px-3 py-2 text-xs text-orange-300">{mazeAction===selected.maze.id?"Procesando...":"Resetear laberinto"}</button><button onClick={()=>mazeActionRequest(selected.maze.id,"deleteMaze")} disabled={mazeAction!==null} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300">Borrar laberinto</button></>}</div></div>{selected.rooms?.length>0&&<MazeMap rooms={selected.rooms} exits={selected.exits??[]} currentRoomId={null} directionLabels={selected.directionLabels}/>}<div className="mt-4 grid gap-3">{selected.rooms.map((r:any)=>{
  const roomOccupants=(selected.occupants??[]).filter((o:any)=>Number(o.roomId)===Number(r.id));
  const locked=roomOccupants.filter((o:any)=>o.status==="TRAPPED"||o.status==="DEAD_LOCKED");
  return <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
    <div className="flex justify-between gap-3"><span>#{r.roomNumber} — {r.roomType}</span><span className="text-xs text-zinc-500">{r.status}</span></div>
    <p className="mt-2 text-sm text-zinc-400">{r.description}</p>
    {r.roomType==="TREASURE"
      ? <p className="mt-1 text-sm text-amber-300">{r.treasureClaimed?"Vacío":"Contiene: "+(r.contentDescription??"Tesoro")}</p>
      : r.contentName&&<p className="mt-1 text-sm">{r.contentName}</p>}
    {r.roomType==="TRAP"&&<div className="mt-3 flex flex-wrap items-center gap-2">
      <span className={r.trapActive===false?"text-emerald-300":"text-amber-300"}>{r.trapActive===false?"✓ Trampa desactivada":"⚠️ Trampa activa"}</span>
      {r.trapActive!==false&&<button onClick={()=>mazeControl(selected.maze.id,"deactivateTrap",r.id)} className="rounded-lg border border-amber-900/60 px-3 py-2 text-xs text-amber-300">Desactivar trampa y liberar atrapados</button>}
    </div>}
    {locked.length>0&&<div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 p-3">
      <p className="text-xs uppercase tracking-wider text-red-300">Jugadores bloqueados</p>
      <div className="mt-2 space-y-2">{locked.map((o:any)=><div key={o.id} className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{o.flair?"⟨"+o.flair+"⟩ ":""}{o.name} — {o.status==="DEAD_LOCKED"?"💀 Muerte":"⚠️ Trampa"}</span>
        <button onClick={()=>mazeControl(selected.maze.id,"releasePlayer",r.id,o.id)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300">Liberar jugador</button>
      </div>)}</div>
    </div>}
    {roomOccupants.filter((o:any)=>o.status!=="TRAPPED"&&o.status!=="DEAD_LOCKED").map((o:any)=><p key={o.id} className="mt-2 text-sm text-cyan-300">🧭 {o.flair?"⟨"+o.flair+"⟩ ":""}{o.name}</p>)}{r.enemies?.filter((e:any)=>e.status==="ACTIVE").map((e:any)=><p key={e.id} className="mt-2 text-sm text-red-300">⚔️ {e.enemy?.name??"Enemigo"} ×{e.quantity}</p>)}
    {r.enemies?.some((e:any)=>e.status==="ACTIVE")&&<button onClick={()=>clear(r.id)} className="mt-3 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300">Confirmar enemigos eliminados</button>}
  </div>
})}</div></section>}</div></main>;
}
