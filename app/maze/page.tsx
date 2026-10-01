"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MazeMap from "@/components/MazeMap";

type Character={id:number;name:string;flair:string|null};
type Occupant={id:number;name:string;flair:string|null;avatarUrl?:string|null;roomId:number;status?:string;lockReason?:string|null};
type Maze={id:number;name:string;description:string|null;mazeType:string;maxRooms:number|null;status:string;roomCount:number};
type Room={id:number;roomNumber:number;roomType:string;status:string;description:string;contentName:string|null;contentDescription:string|null;treasureClaimed:boolean;treasureRewards?:any;trapActive?:boolean;enemies:any[]};
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
  const [copied,setCopied]=useState(false);

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
  async function defeatEnemy(enemy:any){
    if(!mazeId||!characterId)return;
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"defeatEnemy",characterId:Number(characterId),enemyId:Number(enemy.id)})});
    const d=await r.json();
    if(!r.ok)setError(d?.error??"No se pudo derrotar al enemigo.");
    else {setSelectedEnemy(null);await loadMaze();}
    setBusy(false);
  }
  const room=maze?.rooms?.find((r:Room)=>Number(r.id)===Number(position)) as Room|undefined;
  const exits=(maze?.exits??[]).filter((e:Exit)=>Number(e.fromRoomId)===Number(position));
  const roomById=new Map<number,Room>((maze?.rooms??[]).map((entry:Room)=>[Number(entry.id),entry]));
  const occupants=(maze?.occupants??[]).filter((entry:Occupant)=>Number(entry.roomId)===Number(position));
  const statLabels:Record<string,string>={STR:"Fuerza",AGI:"Agilidad",CON:"Constitución",INT:"Inteligencia",WIS:"Sabiduría",CHA:"Carisma",SPI:"Espíritu",LCK:"Suerte"};
  const focusLabels:Record<string,string>={PHYSICAL:"Físico",DEFENSIVE:"Defensivo",MAGICAL:"Mágico",CONTROL:"Control",SPEED:"Velocidad",PRECISION:"Precisión",BALANCED:"Equilibrado"};
  const behaviorLabels:Record<string,string>={AGGRESSIVE:"Agresivo",HUNTER:"Cazador",AMBUSHER:"Emboscador",DEFENSIVE:"Defensivo",ROAMER:"Errante",GUARDIAN:"Guardián",CONTROLLER:"Controlador"};

  const copyText=useMemo(()=>room?[
    `Laberinto: ${maze.maze.name}`,
    `Habitación #${room.roomNumber}`,
    `Tipo: ${typeLabels[room.roomType]??room.roomType}`,
    room.description,
    room.contentName?room.contentName:"",
    room.contentDescription?room.contentDescription:"",
    room.enemies?.length ? [`Enemigos:`, ...room.enemies.map((enemy:any)=>{
      const stats=Object.entries(enemy.generatedStats??{}).map(([key,value])=>`${statLabels[key]??key}: ${String(value)}`).join(" · ");
      const details=[
        `• ${enemy.enemy?.name??"Enemigo"}${enemy.quantity>1?` ×${enemy.quantity}`:""}${String(enemy.status)==="DEFEATED"?" (Derrotado)":""}`,
        enemy.enemy?.rank?`  Rango: ${enemy.enemy.rank}`:"",
        enemy.focus?`  Enfoque: ${focusLabels[enemy.focus]??enemy.focus}`:"",
        enemy.behavior?`  Comportamiento: ${behaviorLabels[enemy.behavior]??enemy.behavior}`:"",
        stats?`  Stats: ${stats}`:"",
        enemy.targetPower!=null?`  Poder objetivo: ${enemy.targetPower}`:""
      ].filter(Boolean);
      return details.join("\n");
    })].join("\n") : "",
    `Salidas: ${exits.map((e:Exit)=>maze.directionLabels?.[e.direction]??e.direction).join(", ")}`,
  ].filter(Boolean).join("\n"):"",[room,maze,exits]);
  async function copy(){
    if(!copyText)return;
    setError("");
    setCopied(false);
    try{
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(copyText);
      else throw new Error("Clipboard API unavailable");
      setCopied(true);
      window.setTimeout(()=>setCopied(false),2500);
    }catch{
      try{
        const area=document.createElement("textarea");
        area.value=copyText;
        area.setAttribute("readonly","");
        area.style.position="fixed";
        area.style.left="-9999px";
        document.body.appendChild(area);
        area.select();
        const ok=document.execCommand("copy");
        area.remove();
        if(!ok)throw new Error("Copy failed");
        setCopied(true);
        window.setTimeout(()=>setCopied(false),2500);
      }catch{
        setError("No se pudo copiar. Mantén pulsado el texto de la habitación para copiarlo.");
      }
    }
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">Laberinto</h1><p className="mt-2 text-zinc-500">Exploración global compartida.</p></div><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Inicio</Link></div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    <section className="mt-8 grid gap-4 md:grid-cols-2"><label className="text-sm text-zinc-400">Personaje<select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Selecciona</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm text-zinc-400">Laberinto<select value={mazeId} onChange={e=>setMazeId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Selecciona</option>{mazes.map(m=><option key={m.id} value={m.id}>{m.name} — {m.mazeType==="FINITE"?m.roomCount+"/"+m.maxRooms:"∞"}</option>)}</select></label></section>
    {maze&&<section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-semibold">{maze.maze.name}</h2><p className="mt-1 text-sm text-zinc-500">{maze.maze.description??"Sin descripción."}</p></div><span className="text-sm text-zinc-500">{maze.rooms.length} habitaciones descubiertas · {({"FREE_3D":"3D libre","PLANAR_2D":"2D","LINEAR":"Pasillo lineal","SPIRAL_TOWER":"Torre espiral"} as Record<string,string>)[String(maze.maze.generationMode ?? "FREE_3D")] ?? "3D libre"}</span></div>{maze?.rooms?.length>0&&<MazeMap rooms={maze.rooms} exits={maze.exits??[]} currentRoomId={position} directionLabels={maze.directionLabels}/>} {!position?<button onClick={join} disabled={busy||!characterId} className="mt-6 rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-40">Entrar al laberinto</button>:room&&<><div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Habitación #{room.roomNumber}</p><h3 className="mt-1 text-2xl font-semibold">{typeLabels[room.roomType]}</h3></div><span className={maze.positionStatus==="DEAD_LOCKED"?"text-red-300":maze.positionStatus==="TRAPPED"?"text-amber-300":room.status==="BLOCKED"?"text-red-300":"text-emerald-300"}>
{maze.positionStatus==="DEAD_LOCKED"?"💀 Bloqueado por muerte":maze.positionStatus==="TRAPPED"?"⚠️ Atrapado por trampa":room.status==="BLOCKED"?"⚔️ Bloqueada":"✓ Transitable"}
</span></div><p className="mt-5 text-zinc-300">{room.description}</p>{room.roomType==="TREASURE"
  ? <div className="mt-3"><p className="font-semibold">Tesoro</p><p className="mt-2 text-sm text-amber-300">{room.treasureClaimed?"Vacío":"Contiene: "+(room.contentDescription??"Un tesoro.")}</p></div>
  : room.contentName&&<p className="mt-3 font-semibold">{room.contentName}</p>}
{room.roomType!=="TREASURE"&&room.contentDescription&&<p className="mt-2 text-sm text-zinc-400">{room.contentDescription}</p>}
{room.roomType==="DEATH"&&<div className="mt-4 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-300">☠️ Esta habitación bloquea al explorador hasta que un GM lo libere.</div>}
{room.roomType==="TRAP"&&<div className="mt-4 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-300">{room.trapActive===false?"✓ Trampa desactivada.":"⚠️ La trampa está activa."}</div>}{room.enemies?.length>0&&<div className="mt-4 space-y-2">{room.enemies.map((enemy:any)=>
<button key={enemy.id} onClick={()=>setSelectedEnemy(enemy)} className="block text-left text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-white">
{enemy.enemy?.name??"Enemigo"} {String(enemy.status)==="DEFEATED"?"(Derrotado)":String(enemy.status)==="ACTIVE"?"(Activo)":`(${enemy.status})`}
</button>)}</div>}{occupants.length>0&&<div className="mt-5 flex flex-wrap gap-2">{occupants.map((occupant:Occupant)=>
<button key={occupant.id} onClick={()=>setSelectedOccupant(occupant)} title={occupant.name} className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-2 text-lg hover:border-zinc-500">
{occupant.flair?"⟨"+occupant.flair+"⟩":occupant.name}
</button>)}</div>}{room.roomType==="TREASURE"&&!room.treasureClaimed&&<button onClick={claim} disabled={busy} className="mt-5 rounded-lg bg-amber-400 px-5 py-3 font-bold text-zinc-950">Tomar tesoro</button>}</div><div className="mt-5 flex flex-wrap gap-3">{exits.map((e:Exit)=>{
  const destination=e.toRoomId?roomById.get(Number(e.toRoomId)):null;
  const isDeath=destination?.roomType==="DEATH";
  const isTrap=destination?.roomType==="TRAP"&&destination.trapActive!==false;
  return <button key={e.id} onClick={()=>move(e.direction)} disabled={busy||maze.positionStatus!=="ACTIVE"||(!e.toRoomId&&room.status==="BLOCKED")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40">
    {isDeath?"💀":isTrap?"⚠️":(maze.directionLabels?.[e.direction]??e.direction)}{isDeath?" Muerte":isTrap?" Trampa":""}{!isDeath&&!isTrap?(e.toRoomId?" ↪":" ✦"):""}
  </button>;
})}</div>{room.roomNumber===1&&<button onClick={leave} disabled={busy||maze.positionStatus!=="ACTIVE"} className="mt-4 rounded-lg border border-red-900/70 px-4 py-3 text-sm text-red-300 disabled:opacity-40">Salir del laberinto</button>}<div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={copy} disabled={!copyText} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40">{copied?"✓ Descripción copiada":"Copiar descripción para WhatsApp"}</button>{copied&&<span className="text-sm text-emerald-300">Ya está en el portapapeles. Pégala en WhatsApp.</span>}</div></>}</section>}
      {selectedEnemy&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={()=>setSelectedEnemy(null)}><div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-red-400">Encuentro</p><h3 className="mt-1 text-2xl font-bold">{selectedEnemy.enemy?.name??"Enemigo"}</h3></div><button onClick={()=>setSelectedEnemy(null)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-400 hover:text-white">×</button></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Ataque físico</span><p className="mt-1 font-semibold">{selectedEnemy.combatStats?.physicalAttack??"—"}</p><span className="text-zinc-500">Defensa física: {selectedEnemy.opponentDerived?.physicalDefense??"—"}</span></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Ataque mágico</span><p className="mt-1 font-semibold">{selectedEnemy.combatStats?.magicAttack??"—"}</p><span className="text-zinc-500">Defensa mágica: {selectedEnemy.opponentDerived?.magicDefense??"—"}</span></div></div><p className="mt-3 text-sm text-zinc-400">{selectedEnemy.enemy?.description??"Sin descripción."}</p><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Rango</span><p className="mt-1 font-semibold">{selectedEnemy.enemy?.rank??"NORMAL"}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Cantidad</span><p className="mt-1 font-semibold">{selectedEnemy.quantity??1}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Enfoque</span><p className="mt-1 font-semibold">{focusLabels[selectedEnemy.focus]??selectedEnemy.focus??"—"}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Comportamiento</span><p className="mt-1 font-semibold">{behaviorLabels[selectedEnemy.behavior]??selectedEnemy.behavior??"—"}</p></div></div><div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><h4 className="text-xs font-semibold text-zinc-400">Stats</h4><p className="mt-1 text-xs leading-5 text-zinc-300">{Object.entries(selectedEnemy.generatedStats??{}).map(([key,value]) => `${statLabels[key]??key}: ${String(value)}`).join(" · ")}</p></div>{selectedEnemy.targetPower!=null&&<p className="mt-4 text-xs text-zinc-500">Poder por enemigo: {selectedEnemy.targetPower} · Cantidad: ×{selectedEnemy.quantity??1} · Poder total: {selectedEnemy.opponentPower??"—"} · Profundidad: ×{selectedEnemy.depthMultiplier??"—"}</p>}{selectedEnemy.canAutoDefeat&&String(selectedEnemy.status)==="ACTIVE"&&<div className="mt-5 rounded-xl border border-emerald-800/70 bg-emerald-950/20 p-4"><p className="text-sm text-emerald-300">Tu ataque supera una de las defensas del oponente.</p><p className="mt-1 text-xs text-zinc-400">Recompensa: ⅖ de un tesoro en dinero + 10 Karma.</p><button onClick={()=>defeatEnemy(selectedEnemy)} disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40">⚔️ Derrotar {String(selectedEnemy.enemy?.rank)==="BOSS"||Boolean(selectedEnemy.enemy?.isBoss)?"jefe":"enemigo"}</button></div>}</div></div>}
      {selectedOccupant&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={()=>setSelectedOccupant(null)}><div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-violet-400">Explorador</p><h3 className="mt-1 text-2xl font-bold">{selectedOccupant.name}</h3>{selectedOccupant.flair&&<p className="mt-2 text-lg text-zinc-300">⟨{selectedOccupant.flair}⟩</p>}</div><button onClick={()=>setSelectedOccupant(null)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-400 hover:text-white">×</button></div>{selectedOccupant.avatarUrl&&<div className="mt-5 flex justify-center"><img src={selectedOccupant.avatarUrl} alt={`Avatar de ${selectedOccupant.name}`} className="h-36 w-36 rounded-xl border border-zinc-700 object-cover" /></div>}<p className="mt-5 text-sm text-zinc-500">Este personaje se encuentra en la misma habitación.</p></div></div>}
  </div></main>;
}
