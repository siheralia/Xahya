"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MazeMap from "@/components/MazeMap";

type Character={id:number;name:string;flair:string|null;avatarUrl?:string|null};
type Occupant={id:number;name:string;flair:string|null;avatarUrl?:string|null;roomId:number;status?:string;lockReason?:string|null};
type Theme={id:number;name:string;slug:string;imageUrl?:string|null};
type Maze={id:number;name:string;description:string|null;mazeType:string;maxRooms:number|null;status:string;roomCount:number;themes?:Theme[]};
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
  const [trapBusy,setTrapBusy]=useState<number|null>(null);
  const [topMenuOpen,setTopMenuOpen]=useState(false);
  const [panel,setPanel]=useState<"none"|"inventory"|"stats"|"map"|"skills">("none");

  useEffect(()=>{Promise.all([fetch("/api/characters?mine=true"),fetch("/api/maze")]).then(async([a,b])=>{const [charText,mazeText]=await Promise.all([a.text(),b.text()]);const chars=charText?JSON.parse(charText):[];const ms=mazeText?JSON.parse(mazeText):[];if(!a.ok)throw new Error(chars?.error??"No se pudieron cargar los personajes.");if(!b.ok)throw new Error(ms?.error??"No se pudieron cargar los laberintos.");setCharacters(Array.isArray(chars)?chars:[]);setMazes(Array.isArray(ms)?ms:[]);}).catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar la exploración."));},[]);
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
  async function moveInvisible(direction:string){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"exploreInvisible",characterId:Number(characterId),direction})});
    const d=await r.json();if(!r.ok)setError(d?.error??"No se pudo explorar invisible.");else await loadMaze();setBusy(false);
  }
  async function moveStealth(direction:string){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"exploreStealth",characterId:Number(characterId),direction})});
    const d=await r.json();if(!r.ok)setError(d?.error??"No se pudo avanzar sigilosamente.");else await loadMaze();setBusy(false);
  }
  async function move(direction:string){
    setBusy(true);setError("");
    const r=await fetch("/api/maze/"+mazeId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),direction})});
    const d=await r.json();if(!r.ok)setError(d?.error??"No se pudo avanzar.");else await loadMaze();setBusy(false);
  }
  async function useTrapConsumable(characterItemId:number, action:"DISARM_MAZE_TRAP"|"RELEASE_MAZE_TRAPPED"){
    if(!mazeId||!characterId||trapBusy!==null)return;
    setTrapBusy(characterItemId);setError("");
    const r=await fetch("/api/characters/"+characterId+"/items/use",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterItemId})});
    const d=await r.json().catch(()=>null);
    if(!r.ok)setError(d?.error??"No se pudo usar el consumible.");
    else await loadMaze();
    setTrapBusy(null);
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
  const exits=(maze?.currentExits??maze?.exits??[]).filter((e:Exit)=>Number(e.fromRoomId)===Number(position));
  const roomById=new Map<number,Room>((maze?.rooms??[]).map((entry:Room)=>[Number(entry.id),entry]));
  // La entrada es exclusivamente la salida que lleva a la habitación de la que acabas de venir.
  // No buscamos cualquier conexión que apunte a la habitación actual: en un laberinto
  // compartido puede haber varias, y eso hacía que se marcara una salida equivocada.
  const previousRoomId=maze?.previousRoomId==null?null:Number(maze.previousRoomId);
  const returnExitId=previousRoomId!=null
    ? exits.find((e:Exit)=>Number(e.toRoomId)===previousRoomId)?.id
    : undefined;
  const occupants=(maze?.occupants??[]).filter((entry:Occupant)=>Number(entry.roomId)===Number(position));
  const hasActiveRoomEnemies=Boolean(room?.enemies?.some((enemy:any)=>String(enemy.status)==="ACTIVE"));
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

  return <main className="min-h-screen bg-zinc-950 text-white">
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-3 py-3 sm:px-5 sm:py-4">
      <header className="relative z-40 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 shadow-xl backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={()=>setTopMenuOpen(v=>!v)} aria-label="Abrir menú" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700 bg-zinc-950 text-lg hover:border-zinc-500">☰</button>
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-bold tracking-wide">Xahya</span><span className="h-2 w-2 rounded-full bg-emerald-400"/></div><p className="truncate text-xs text-zinc-500">{maze?.maze?.name??"Laberinto"} {room?("· Habitación #"+room.roomNumber):""}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="hidden max-w-[180px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm sm:block"><option value="">Personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={mazeId} onChange={e=>setMazeId(e.target.value)} className="hidden max-w-[210px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm md:block"><option value="">Laberinto</option>{mazes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
        {topMenuOpen&&<div className="absolute left-3 top-[calc(100%+8px)] w-64 rounded-2xl border border-zinc-700 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur sm:left-4">
          <button onClick={()=>{setPanel("stats");setTopMenuOpen(false)}} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-zinc-900">🧙 Estado del personaje</button>
          <button onClick={()=>{setPanel("inventory");setTopMenuOpen(false)}} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-zinc-900">🎒 Inventario y equipo</button>
          <button onClick={()=>{setPanel("skills");setTopMenuOpen(false)}} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-zinc-900">✨ Habilidades</button>
          <button onClick={()=>{setPanel("map");setTopMenuOpen(false)}} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-zinc-900">🗺️ Mapa ampliado</button>
          <Link href="/" className="block rounded-xl px-3 py-2.5 text-sm hover:bg-zinc-900">⌂ Inicio</Link>
        </div>}
      </header>
      {error&&<div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      {!maze&&<section className="mt-3 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-2">
        <label className="text-xs text-zinc-500">Personaje<select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm"><option value="">Selecciona</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-xs text-zinc-500">Laberinto<select value={mazeId} onChange={e=>setMazeId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm"><option value="">Selecciona</option>{mazes.map(m=><option key={m.id} value={m.id}>{m.name} — {m.mazeType==="FINITE"?m.roomCount+"/"+m.maxRooms:"∞"}</option>)}</select></label>
      </section>}
      {maze&&<div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="relative flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/35">
          <div className="absolute inset-0">{maze.maze.themes?.filter((t:Theme)=>t.imageUrl).map((t:Theme)=><img key={t.id} src={t.imageUrl??""} alt="" className="absolute inset-0 h-full w-full object-cover opacity-10" />)}<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_55%)]"/></div>
          <div className="relative flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/45 px-4 py-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Momento actual</p><h1 className="text-lg font-semibold">{room?typeLabels[room.roomType]:"Exploración"}</h1></div>{room&&<span className={maze.positionStatus==="DEAD_LOCKED"?"text-red-300":maze.positionStatus==="TRAPPED"?"text-amber-300":room.status==="BLOCKED"?"text-red-300":"text-emerald-300"}>{maze.positionStatus==="DEAD_LOCKED"?"💀 Bloqueado":maze.positionStatus==="TRAPPED"?"⚠️ Atrapado":room.status==="BLOCKED"?"⚔️ Bloqueada":"● Activo"}</span>}</div>
          {!position?<div className="relative flex flex-1 items-center justify-center p-6"><div className="max-w-md text-center"><div className="text-6xl">🗺️</div><h2 className="mt-4 text-2xl font-bold">Listo para explorar</h2><p className="mt-2 text-sm text-zinc-500">Selecciona tu personaje y entra al laberinto para comenzar.</p><button onClick={join} disabled={busy||!characterId} className="mt-5 rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-40">Entrar al laberinto</button></div></div>:room&&<div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-5">
            <div className="flex items-center justify-center rounded-2xl border border-zinc-800/80 bg-zinc-950/35 p-2"><div className="w-full max-w-md">
              <div className="grid grid-cols-5 grid-rows-[32px_32px_64px_32px_32px] items-center justify-items-center gap-1">
                <div/>
                <div/>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="UP");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="UP")||maze.positionStatus!=="ACTIVE"} title="Arriba" className="col-start-3 grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">🔺</button>
                <div/>
                <div/>

                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="O_UP");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="O_UP")||maze.positionStatus!=="ACTIVE"} title="Oeste + arriba" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬅️🔺</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="N_UP");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="N_UP")||maze.positionStatus!=="ACTIVE"} title="Norte + arriba" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬆️🔺</button>
                <div/>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="S_UP");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="S_UP")||maze.positionStatus!=="ACTIVE"} title="Sur + arriba" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬇️🔺</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="E_UP");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="E_UP")||maze.positionStatus!=="ACTIVE"} title="Este + arriba" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">➡️🔺</button>

                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="O");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="O")||maze.positionStatus!=="ACTIVE"} title="Oeste" className="grid h-9 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬅️</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="N");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="N")||maze.positionStatus!=="ACTIVE"} title="Norte" className="grid h-9 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬆️</button>
                <div className="flex h-14 w-full max-w-[180px] items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-950/20 px-2 shadow-[0_0_25px_rgba(139,92,246,0.08)]">
                  <div className="flex items-center gap-2">
                    {characters.find(c=>Number(c.id)===Number(characterId))?.avatarUrl?<img src={characters.find(c=>Number(c.id)===Number(characterId))?.avatarUrl??""} alt="" className="h-10 w-10 rounded-lg border border-violet-400/30 object-cover"/>:<div className="grid h-10 w-10 place-items-center rounded-lg border border-violet-400/30 bg-zinc-950/60 text-xl">{characters.find(c=>Number(c.id)===Number(characterId))?.flair?"⟨"+characters.find(c=>Number(c.id)===Number(characterId))?.flair+"⟩":"🧙"}</div>}
                    <div className="min-w-0 text-left"><p className="truncate text-xs font-semibold">{characters.find(c=>Number(c.id)===Number(characterId))?.name??"Personaje"}</p><p className="text-[8px] uppercase tracking-widest text-zinc-600">#{room.roomNumber}</p></div>
                  </div>
                </div>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="S");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="S")||maze.positionStatus!=="ACTIVE"} title="Sur" className="grid h-9 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬇️</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="E");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="E")||maze.positionStatus!=="ACTIVE"} title="Este" className="grid h-9 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">➡️</button>

                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="O_DOWN");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="O_DOWN")||maze.positionStatus!=="ACTIVE"} title="Oeste + abajo" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬅️🔻</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="N_DOWN");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="N_DOWN")||maze.positionStatus!=="ACTIVE"} title="Norte + abajo" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬆️🔻</button>
                <div/>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="S_DOWN");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="S_DOWN")||maze.positionStatus!=="ACTIVE"} title="Sur + abajo" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">⬇️🔻</button>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="E_DOWN");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="E_DOWN")||maze.positionStatus!=="ACTIVE"} title="Este + abajo" className="grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-[11px] transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">➡️🔻</button>

                <div/>
                <div/>
                <button onClick={()=>{const exit=exits.find((e:Exit)=>e.direction==="DOWN");if(exit)move(exit.direction)}} disabled={busy||!exits.find((e:Exit)=>e.direction==="DOWN")||maze.positionStatus!=="ACTIVE"} title="Abajo" className="col-start-3 grid h-8 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-20">🔻</button>
                <div/>
                <div/>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {room.enemies?.filter((e:any)=>String(e.status)==="ACTIVE").map((enemy:any)=><button key={enemy.id} onClick={()=>setSelectedEnemy(enemy)} className="inline-flex items-center gap-1.5 rounded-full border border-red-900/70 bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-200 hover:border-red-700">{enemy.enemy?.imageUrl?<img src={enemy.enemy.imageUrl} alt="" className="h-5 w-5 rounded-full object-cover"/>:"👹"} {enemy.enemy?.name??"Enemigo"} {enemy.quantity>1?"×"+enemy.quantity:""}</button>)}
              {room.roomType==="TREASURE"&&!room.treasureClaimed&&<button onClick={claim} disabled={busy} className="rounded-full border border-amber-700/70 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">💰 Tesoro</button>}{room.contentName&&<span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] text-zinc-300">✦ {room.contentName}</span>}
              </div></div></div>
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-zinc-200">📍 Entorno</p><p className="mt-1 text-sm leading-5 text-zinc-400">{room.description}</p></div><button onClick={copy} disabled={!copyText} className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-400">{copied?"✓ Copiado":"Copiar"}</button></div>{(room.contentDescription||room.roomType==="DEATH")&&<p className="mt-2 text-xs text-zinc-500">{room.roomType==="DEATH"?"☠️ Esta habitación bloquea al explorador hasta que un GM lo libere.":room.contentDescription}</p>}</div>
            <div className="mt-3 hidden grid gap-2 sm:grid-cols-2">{exits.map((e:Exit)=>{const destination=e.toRoomId?roomById.get(Number(e.toRoomId)):null;const isDeath=destination?.roomType==="DEATH",isTrap=destination?.roomType==="TRAP"&&destination.trapActive!==false,isEntryExit=Number(e.id)===Number(returnExitId);return <button key={e.id} onClick={()=>move(e.direction)} disabled={busy||maze.positionStatus!=="ACTIVE"||(!e.toRoomId&&room.status==="BLOCKED")} className={"rounded-xl border px-3 py-2.5 text-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40 "+(isEntryExit?"border-cyan-400/60 bg-cyan-400/5 text-cyan-200":isDeath?"border-red-900/70 bg-red-950/20 text-red-200":isTrap?"border-amber-900/70 bg-amber-950/20 text-amber-200":"border-zinc-800 bg-zinc-950/70 text-zinc-300")}>{isDeath?"💀 ":isTrap?"⚠️ ":isEntryExit?"↩️ ":""}{maze.directionLabels?.[e.direction]??e.direction}{isEntryExit?" · Entrada":""}</button>})}</div>
            {hasActiveRoomEnemies&&<div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3"><p className="text-sm font-semibold text-cyan-200">🥷 Sigilo</p><p className="mt-1 text-[11px] text-zinc-500">Compara tu Sigilo con la Detección enemiga.</p><div className="mt-2 flex flex-wrap gap-1.5">{exits.map((e:Exit)=><button key={"s"+e.id} onClick={()=>moveStealth(e.direction)} disabled={busy} className="rounded-lg border border-cyan-800 px-2.5 py-1.5 text-xs text-cyan-200 disabled:opacity-40">🥷 {maze.directionLabels?.[e.direction]??e.direction}</button>)}</div></div>{maze?.mazeCapabilities?.invisibility&&maze.positionStatus==="ACTIVE"&&<div className="rounded-xl border border-violet-900/60 bg-violet-950/20 p-3"><p className="text-sm font-semibold text-violet-200">🫥 Invisibilidad</p><p className="mt-1 text-[11px] text-zinc-500">Atraviesa al enemigo sin derrotarlo.</p><div className="mt-2 flex flex-wrap gap-1.5">{exits.map((e:Exit)=><button key={"i"+e.id} onClick={()=>moveInvisible(e.direction)} disabled={busy} className="rounded-lg border border-violet-800 px-2.5 py-1.5 text-xs text-violet-200 disabled:opacity-40">🫥 {maze.directionLabels?.[e.direction]??e.direction}</button>)}</div></div>}</div>}
            {room.roomType==="TRAP"&&<div className="mt-3 rounded-xl border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-200">{room.trapActive===false?"✓ Trampa desactivada.":"⚠️ La trampa está activa."}{maze.positionStatus==="TRAPPED"&&Array.isArray(maze.trapActions)&&maze.trapActions.length>0&&<div className="mt-2 space-y-1.5">{maze.trapActions.map((entry:any)=><button key={entry.characterItemId+"-"+entry.action} onClick={()=>useTrapConsumable(Number(entry.characterItemId),entry.action)} disabled={trapBusy!==null||busy} className="w-full rounded-lg border border-amber-800 bg-zinc-950/60 px-3 py-2 text-left text-xs disabled:opacity-50">{trapBusy===Number(entry.characterItemId)?"Usando...":entry.action==="DISARM_MAZE_TRAP"?"🛠️ Desactivar trampa":"🔓 Liberarme"} <span className="text-zinc-600">({entry.name} ×{entry.quantity})</span></button>)}</div>}</div>}
          </div>}
        </section>
        <aside className="flex min-h-0 flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50"><div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5"><div><p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Navegación</p><h2 className="font-semibold">🗺️ Mapa</h2></div><button onClick={()=>setPanel("map")} className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-white">Expandir</button></div><div className="p-2"><MazeMap rooms={maze.rooms??[]} exits={maze.exits??[]} currentRoomId={position} directionLabels={maze.directionLabels}/></div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl border border-violet-500/30 bg-violet-950/20 text-xl">{characters.find(c=>Number(c.id)===Number(characterId))?.flair?"⟨"+characters.find(c=>Number(c.id)===Number(characterId))?.flair+"⟩":"🧙"}</div><div className="min-w-0"><p className="truncate font-semibold">{characters.find(c=>Number(c.id)===Number(characterId))?.name??"Personaje"}</p><p className="text-xs text-zinc-500">Explorador</p></div></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-zinc-950/80 p-2"><p className="text-[10px] text-zinc-600">❤️ HP</p><p className="mt-1 font-semibold">—</p></div><div className="rounded-lg bg-zinc-950/80 p-2"><p className="text-[10px] text-zinc-600">🔷 Mana</p><p className="mt-1 font-semibold">—</p></div></div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">{["⚔️","🪄","🛡️","✨"].map((icon,i)=><button key={i} onClick={()=>setPanel("skills")} className="relative grid h-10 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-sm hover:border-zinc-600">{icon}<span className="absolute bottom-0.5 right-1 text-[9px] text-zinc-600">—</span></button>)}</div>
            <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={()=>setPanel("stats")} className="rounded-lg border border-zinc-800 px-2 py-2 text-xs text-zinc-400 hover:text-white">📊 Stats</button><button onClick={()=>setPanel("inventory")} className="rounded-lg border border-zinc-800 px-2 py-2 text-xs text-zinc-400 hover:text-white">🎒 Inventario</button></div>
          </div>
          <div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 text-center"><p className="text-[10px] text-zinc-600">🪙 Dinero</p><p className="font-semibold">—</p></div><div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 text-center"><p className="text-[10px] text-zinc-600">🪷 Karma</p><p className="font-semibold">—</p></div><div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 text-center"><p className="text-[10px] text-zinc-600">📍 Salas</p><p className="font-semibold">{maze.rooms?.length??0}</p></div></div>
          {room?.roomNumber===1&&<button onClick={leave} disabled={busy||maze.positionStatus!=="ACTIVE"} className="rounded-xl border border-red-900/70 px-3 py-2.5 text-sm text-red-300 disabled:opacity-40">Salir del laberinto</button>}
        </aside>
      </div>}
      {panel!=="none"&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-4" onClick={()=>setPanel("none")}><div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl sm:p-5" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Panel</p><h2 className="text-xl font-bold">{panel==="inventory"?"🎒 Inventario y equipo":panel==="stats"?"📊 Estado y estadísticas":panel==="skills"?"✨ Habilidades":"🗺️ Mapa ampliado"}</h2></div><button onClick={()=>setPanel("none")} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-400">×</button></div>{panel==="map"?<div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-zinc-800 p-2"><MazeMap rooms={maze?.rooms??[]} exits={maze?.exits??[]} currentRoomId={position} directionLabels={maze?.directionLabels}/></div>:panel==="skills"?<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{["⚔️","🪄","🛡️","✨"].map((icon,i)=><div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"><div className="text-2xl">{icon}</div><p className="mt-3 text-xs text-zinc-500">Ranura {i+1}</p><p className="mt-1 font-semibold">Sin datos</p></div>)}</div>:panel==="inventory"?<div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">El inventario y equipo siguen disponibles desde la ficha del personaje. Este panel queda reservado para la versión compacta del HUD.</div>:<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(statLabels).map(([key,label])=><div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs text-zinc-600">{key}</p><p className="mt-1 font-medium">{label}</p><p className="mt-2 text-xl font-bold">—</p></div>)}</div>}</div></div>}
      {selectedEnemy&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={()=>setSelectedEnemy(null)}><div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3">{selectedEnemy.enemy?.imageUrl&&<img src={selectedEnemy.enemy.imageUrl} alt="" className="h-16 w-16 rounded-lg border border-zinc-700 object-cover" />}<div><p className="text-xs uppercase tracking-widest text-red-400">Encuentro</p><h3 className="mt-1 text-2xl font-bold">{selectedEnemy.enemy?.name??"Enemigo"}</h3></div></div><button onClick={()=>setSelectedEnemy(null)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-400 hover:text-white">×</button></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Ataque físico</span><p className="mt-1 font-semibold">{selectedEnemy.combatStats?.physicalAttack??"—"}</p><span className="text-zinc-500">Defensa física: {selectedEnemy.opponentDerived?.physicalDefense??"—"}</span></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Ataque mágico</span><p className="mt-1 font-semibold">{selectedEnemy.combatStats?.magicAttack??"—"}</p><span className="text-zinc-500">Defensa mágica: {selectedEnemy.opponentDerived?.magicDefense??"—"}</span></div></div><p className="mt-3 text-sm text-zinc-400">{selectedEnemy.enemy?.description??"Sin descripción."}</p><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Rango</span><p className="mt-1 font-semibold">{selectedEnemy.enemy?.rank??"NORMAL"}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Cantidad</span><p className="mt-1 font-semibold">{selectedEnemy.quantity??1}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Enfoque</span><p className="mt-1 font-semibold">{focusLabels[selectedEnemy.focus]??selectedEnemy.focus??"—"}</p></div><div className="rounded-lg bg-zinc-900 p-3"><span className="text-zinc-500">Comportamiento</span><p className="mt-1 font-semibold">{behaviorLabels[selectedEnemy.behavior]??selectedEnemy.behavior??"—"}</p></div></div><div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><h4 className="text-xs font-semibold text-zinc-400">Stats</h4><p className="mt-1 text-xs leading-5 text-zinc-300">{Object.entries(selectedEnemy.generatedStats??{}).map(([key,value]) => `${statLabels[key]??key}: ${String(value)}`).join(" · ")}</p></div>{selectedEnemy.targetPower!=null&&<p className="mt-4 text-xs text-zinc-500">Poder por enemigo: {selectedEnemy.targetPower} · Cantidad: ×{selectedEnemy.quantity??1} · Poder total: {selectedEnemy.opponentPower??"—"} · Profundidad: ×{selectedEnemy.depthMultiplier??"—"}</p>}{selectedEnemy.canAutoDefeat&&String(selectedEnemy.status)==="ACTIVE"&&<div className="mt-5 rounded-xl border border-emerald-800/70 bg-emerald-950/20 p-4"><p className="text-sm text-emerald-300">Tu ataque supera una de las defensas del oponente.</p><p className="mt-1 text-xs text-zinc-400">Recompensa: ⅖ de un tesoro en dinero + 10 Karma.</p><button onClick={()=>defeatEnemy(selectedEnemy)} disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40">⚔️ Derrotar {String(selectedEnemy.enemy?.rank)==="BOSS"||Boolean(selectedEnemy.enemy?.isBoss)?"jefe":"enemigo"}</button></div>}</div></div>}
      {selectedOccupant&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={()=>setSelectedOccupant(null)}><div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-violet-400">Explorador</p><h3 className="mt-1 text-2xl font-bold">{selectedOccupant.name}</h3>{selectedOccupant.flair&&<p className="mt-2 text-lg text-zinc-300">⟨{selectedOccupant.flair}⟩</p>}</div><button onClick={()=>setSelectedOccupant(null)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-400 hover:text-white">×</button></div>{selectedOccupant.avatarUrl&&<div className="mt-5 flex justify-center"><img src={selectedOccupant.avatarUrl} alt={`Avatar de ${selectedOccupant.name}`} className="h-36 w-36 rounded-xl border border-zinc-700 object-cover" /></div>}<p className="mt-5 text-sm text-zinc-500">Este personaje se encuentra en la misma habitación.</p></div></div>}
  </div>
  </main>;
}
