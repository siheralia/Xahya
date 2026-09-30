"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Character={id:number;name:string;flair:string|null};
type Occupant={id:number;name:string;flair:string|null;roomId:number};
type Maze={id:number;name:string;description:string|null;mazeType:string;maxRooms:number|null;status:string;roomCount:number};
type Room={id:number;roomNumber:number;roomType:string;status:string;description:string;contentName:string|null;contentDescription:string|null;treasureClaimed:boolean;enemies:any[]};
type Exit={id:number;fromRoomId:number;toRoomId:number|null;direction:string};

const typeLabels:Record<string,string>={ENEMY:"Enemigos",TRAP:"Trampa",BOSS:"Jefe",TREASURE:"Tesoro",SAFE:"Zona segura",DEATH:"Muerte",MOBILE_ENEMY:"Enemigo móvil",NPC:"NPC"};

export default function MazePage(){
  const [characters,setCharacters]=useState<Character[]>([]);
  const [mazes,setMazes]=useState<Maze[]>([]);
  const [mazeId,setMazeId]=useState("");
  const [characterId,setCharacterId]=useState("");
  const [maze,setMaze]=useState<any>(null);
  const [position,setPosition]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [selectedEnemy,setSelectedEnemy]=useState<any>(null);
  const [selectedOccupant,setSelectedOccupant]=useState<Occupant|null>(null);

  useEffect(()=>{Promise.all([fetch("/api/characters"),fetch("/api/maze")]).then(async([a,b])=>{const [charText,mazeText]=await Promise.all([a.text(),b.text()]);const chars=charText?JSON.parse(charText):[];const ms=mazeText?JSON.parse(mazeText):[];if(!a.ok)throw new Error(chars?.error??"No se pudieron cargar los personajes.");if(!b.ok)throw new Error(ms?.error??"No se pudieron cargar los laberintos.");setCharacters(Array.isArray(chars)?chars:[]);setMazes(Array.isArray(ms)?ms:[]);}).catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar la exploración."));},[]);
  useEffect(()=>{if(!mazeId||!characterId)return; loadMaze();},[mazeId,characterId]);

  async function loadMaze(){
    const r=await fetch("/api/maze/"+mazeId+"?characterId="+characterId,{cache:"no-store"});const d=await r.json();
    if(!r.ok){setError(d?.error??"No se pudo cargar el laberinto.");return;}
    setMaze(d);setPosition(d.position);
  }
  async function join(){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId)})});
    const d=await r.json(); if(!r.ok)setError(d?.error??"No se pudo entrar."); else {setPosition(Number(d.roomId));await loadMaze();}
    setBusy(false);
  }
  async function move(direction:string){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),direction})});
    const d=await r.json();if(!r.ok)setError(d?.error??"No se pudo avanzar.");else await loadMaze();setBusy(false);
  }
  async function leave(){
    if(!mazeId||!characterId)return;
    if(!window.confirm("¿Salir del laberinto? Podrás volver a entrar después."))return;
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"leave",characterId:Number(characterId)})});
    const d=await r.json(); if(!r.ok)setError(d?.error??"No se pudo salir."); else {setPosition(null);await loadMaze();}
    setBusy(false);
  }
  async function claim(){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId+"/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),roomId:position})});
    const d=await r.json();if(!r.ok)setError(d?.error??"No se pudo reclamar.");else await loadMaze();setBusy(false);
  }
  const room=maze?.rooms?.find((r:Room)=>Number(r.id)===Number(position)) as Room|undefined;
  const exits=(maze?.exits??[]).filter((e:Exit)=>Number(e.fromRoomId)===Number(position));
  const occupants=(maze?.occupants??[]).filter((entry:Occupant)=>Number(entry.roomId)===Number(position));
  const copyText=useMemo(()=>room?[
    `Laberinto: ${maze.maze.name}`,
    `Habitación #${room.roomNumber}`,
    `Tipo: ${typeLabels[room.roomType]??room.roomType}`,
    room.description,
    room.contentName?room.contentName:"",
    room.contentDescription?room.contentDescription:"",
    `Salidas: ${exits.map((e:Exit)=>maze.directionLabels?.[e.direction]??e.direction).join(", ")}`,
  ].filter(Boolean).join("\n"):"",[room,maze,exits]);
  async function copy(){try{await navigator.clipboard.writeText(copyText);setError("Descripción copiada para WhatsApp.");}catch{try{const area=document.createElement("textarea");area.value=copyText;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.focus();area.select();document.execCommand("copy");area.remove();setError("Descripción copiada para WhatsApp.");}catch{setError("No se pudo copiar la descripción. Mantén pulsado el texto para copiarlo.");}}}

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">Laberinto</h1><p className="mt-2 text-zinc-500">Exploración global compartida.</p></div><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Inicio</Link></div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    <section className="mt-8 grid gap-4 md:grid-cols-2"><label className="text-sm text-zinc-400">Personaje<select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Selecciona</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm text-zinc-400">Laberinto<select value={mazeId} onChange={e=>setMazeId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Selecciona</option>{mazes.map(m=><option key={m.id} value={m.id}>{m.name} — {m.mazeType==="FINITE"?m.roomCount+"/"+m.maxRooms:"∞"}</option>)}</select></label></section>
    {maze&&<section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-semibold">{maze.maze.name}</h2><p className="mt-1 text-sm text-zinc-500">{maze.maze.description??"Sin descripción."}</p></div><span className="text-sm text-zinc-500">{maze.rooms.length} habitaciones descubiertas</span></div>{!position?<button onClick={join} disabled={busy||!characterId} className="mt-6 rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-40">Entrar al laberinto</button>:room&&<><div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Habitación #{room.roomNumber}</p><h3 className="mt-1 text-2xl font-semibold">{typeLabels[room.roomType]}</h3></div><span className={room.status==="BLOCKED"?"text-red-300":"text-emerald-300"}>{room.status==="BLOCKED"?"⚔️ Bloqueada":"✓ Transitable"}</span></div><p className="mt-5 text-zinc-300">{room.description}</p>{room.contentName&&<p className="mt-3 font-semibold">{room.contentName}</p>}{room.contentDescription&&<p className="mt-2 text-sm text-zinc-400">{room.contentDescription}</p>}{room.enemies?.length>0&&<div className="mt-4 space-y-2">{room.enemies.map((enemy:any)=>
<button key={enemy.id} onClick={()=>setSelectedEnemy(enemy)} className="block text-left text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-white">
{enemy.enemy?.name??"Enemigo"} {String(enemy.status)==="DEFEATED"?"(Derrotado)":String(enemy.status)==="ACTIVE"?"(Activo)":`(${enemy.status})`}
</button>)}</div>}{occupants.length>0&&<div className="mt-5 flex flex-wrap gap-2">{occupants.map((occupant:Occupant)=>
<button key={occupant.id} onClick={()=>setSelectedOccupant(occupant)} title={occupant.name} className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-2 text-lg hover:border-zinc-500">
{occupant.flair?"⟨"+occupant.flair+"⟩":occupant.name}
</button>)}</div>}{room.roomType==="TREASURE"&&!room.treasureClaimed&&<button onClick={claim} disabled={busy} className="mt-5 rounded-lg bg-amber-400 px-5 py-3 font-bold text-zinc-950">Tomar tesoro</button>}</div><div className="mt-5 flex flex-wrap gap-3">{exits.map((e:Exit)=><button key={e.id} onClick={()=>move(e.direction)} disabled={busy||(!e.toRoomId&&room.status==="BLOCKED")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40">{maze.directionLabels?.[e.direction]??e.direction}{e.toRoomId?" ↪":" ✦"}</button>)}</div>{room.roomNumber===1&&<button onClick={leave} disabled={busy} className="mt-4 rounded-lg border border-red-900/70 px-4 py-3 text-sm text-red-300 disabled:opacity-40">Salir del laberinto</button>}<button onClick={copy} className="mt-5 rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300">Copiar descripción para WhatsApp</button></>}</section>}
  </div></main>;
}
