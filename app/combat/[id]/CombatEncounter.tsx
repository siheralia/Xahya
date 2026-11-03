"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import {
  actionPoints, canAct, deflectionAlignment, effectiveCombatSpeed, remainingAp, turnTicks,
  type CombatCommand, type CombatState, type DefenseChoice, type Point, type Side,
} from "@/lib/combat/turn-engine";

type View = {state:CombatState;permissions:{PLAYER:boolean;NPC:boolean};
 canMove:{PLAYER:boolean;NPC:boolean}};
const options: Array<{value:DefenseChoice,label:string,description:string}> = [
 {value:"DODGE",label:"Esquivar",description:"Precisión vs Esquive"},
 {value:"BLOCK",label:"Bloquear",description:"STR vs CON; desgaste del arma"},
 {value:"ENDURE",label:"Resistir",description:"STR vs CON"},
 {value:"REPEL",label:"Repeler",description:"STR vs STR; empuje"},
 {value:"DEFLECT",label:"Desviar",description:"STR vs AGI y orientación de guardia"},
 {value:"NONE",label:"No reaccionar",description:"Recibir el impacto sin respuesta activa"},
];
const defaultPath:Point[]=[{x:0.1,y:0.5},{x:0.9,y:0.5}];
function Fighter({name,side,state}:{name:string;side:Side;state:CombatState}) {
 const f=state.actors[side];
 return <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
  <p className="font-bold">{name}</p>
  <div className="mt-3 flex items-center justify-between text-sm"><span>❤️ HP</span>
   <span>{f.hp}/{f.maxHp}</span></div>
  <div className="mt-1 h-2 overflow-hidden rounded bg-zinc-700">
   <div className="h-full bg-rose-400 transition-all" style={{width:(100*f.hp/f.maxHp)+"%"}}/>
  </div>
  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
   <span>Ticks: {f.spentTicks}/100</span>
   <span>PA: {remainingAp(f)}/{actionPoints(f.constitution)}</span>
   <span>AGI: {f.agility}</span>
   <span>{turnTicks(f)} ticks/acción</span>
   <span>STR: {f.strength}</span>
   <span>CON: {f.constitution}</span>
   <span>Arma: {f.weaponIntegrity}/100</span>
   <span>Masa: {f.massKg} kg</span>
  </div>
 </div>;
}
export default function CombatEncounter({id}:{id:string}) {
 const [view,setView]=useState<View|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [side,setSide]=useState<Side>("PLAYER");
 const [attackType,setAttackType]=useState<"CUT"|"BLUNT"|"PIERCE">("CUT");
 const [meters,setMeters]=useState(1);
 const [moveDirection,setMoveDirection]=useState<"TOWARD"|"AWAY">("TOWARD");
 const [points,setPoints]=useState<Point[]>(defaultPath);
 const [drawing,setDrawing]=useState(false);
 const [defense,setDefense]=useState<DefenseChoice>("DODGE");
 const [angle,setAngle]=useState(90);
 const [flash,setFlash]=useState(false);
 const lastResolution=useRef("");
 const canvas=useRef<SVGSVGElement|null>(null);
 const load=useCallback(async()=>{
  try {
   const r=await fetch("/api/combat/"+id+"/actions",{cache:"no-store"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Error al consultar el combate.");
   setView(data);
   if(!data.permissions.PLAYER&&data.permissions.NPC)setSide("NPC");
   const events=(data.state as CombatState).log;
   const last=events.filter(e=>e.kind==="RESOLVE").at(-1);
   const key=last?last.tick+":"+last.summary+":"+last.defense:"";
   if(key&&lastResolution.current&&key!==lastResolution.current) {
    setFlash(true);
    window.setTimeout(()=>setFlash(false),330);
   }
   if(key)lastResolution.current=key;
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el combate.");}
 },[id]);
 useEffect(()=>{
  void load();
  const handle=window.setInterval(()=>{void load();},3500);
  return ()=>window.clearInterval(handle);
 },[load]);
 async function submit(command:CombatCommand | {kind:"ADVANCE"}) {
  if(busy)return;
  setBusy(true);setError("");
  try {
   const r=await fetch("/api/combat/"+id+"/actions",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({side,command}),
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Acción rechazada");
   setView(v=>v?{...v,state:data.state}:v);
   const evt=(data.state as CombatState).log.filter(e=>e.kind==="RESOLVE").at(-1);
   if(evt && evt.tick+":"+evt.summary+":"+evt.defense!==lastResolution.current) {
    setFlash(true);window.setTimeout(()=>setFlash(false),330);
    lastResolution.current=evt.tick+":"+evt.summary+":"+evt.defense;
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo realizar la acción.");}
  finally{setBusy(false);}
 }
 function toPoint(e:PointerEvent<SVGSVGElement>):Point {
  const rect=canvas.current?.getBoundingClientRect();
  if(!rect)return {x:0,y:0};
  return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
    y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
 }
 function startDraw(e:PointerEvent<SVGSVGElement>) {
  e.currentTarget.setPointerCapture(e.pointerId);
  setDrawing(true);setPoints([toPoint(e)]);
 }
 function continueDraw(e:PointerEvent<SVGSVGElement>) {
  if(!drawing)return;
  setPoints(previous=>previous.length>=79?previous:[...previous,toPoint(e)]);
 }
 function endDraw(e:PointerEvent<SVGSVGElement>) {
  if(!drawing)return;
  setDrawing(false);
  setPoints(previous=>previous.length<2?[...previous,toPoint(e)]:previous);
 }
 const state=view?.state;
 const tiedSpeed=!!state&&effectiveCombatSpeed(state.actors.PLAYER)===effectiveCombatSpeed(state.actors.NPC);
 const actor=state?.actors[side];
 const pending=state?.pending;
 const hasAccess=view?.permissions[side]??false;
 const defending=!!pending&&pending.against===side;
 const ready=!!state&&hasAccess&&canAct(state,side)&&!busy;
 const maxMove=actor?Math.max(1,Math.round(actor.race/10)):1;
 const normalizedPath=points.length>1?points:defaultPath;
 const polyline=normalizedPath.map(p=>(p.x*100).toFixed(1)+","+(p.y*100).toFixed(1)).join(" ");
 return <main className="mx-auto max-w-5xl px-4 py-7 text-zinc-100">
  {flash&&<div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[3000] bg-rose-200/50"/>}
  <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
   <h1 className="text-2xl font-bold">⚔️ Encuentro #{id}</h1>
   <Link className="text-cyan-300" href="/combat">Nuevo encuentro</Link>
  </div>
  {error&&<p role="alert" className="mb-4 rounded-lg border border-rose-600/50 p-3 text-rose-300">{error}</p>}
  {!state?<p>Cargando combate…</p>:<>
   <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-700 p-3 text-sm">
    <span>Turno: <b>{state.round}</b></span><span>Tick global: <b>{state.tick}</b></span>
    <span>{state.status==="ACTIVE"?"En curso":"Finalizado"}</span>
    {tiedSpeed&&state.status==="ACTIVE"&&
      <span>Iniciativa alternada: <b>{
        state.pending?("Reacción de "+state.actors[state.pending.against].name)
          : canAct(state,"PLAYER")?state.actors.PLAYER.name
          : canAct(state,"NPC")?state.actors.NPC.name:"Sin acciones disponibles"
      }</b></span>}
    {state.winner&&<b>Ganador: {state.actors[state.winner].name}</b>}
   </div>
   <p className="mb-3 text-sm text-zinc-300">Distancia entre combatientes: <b>{Math.abs(state.actors.PLAYER.positionMeters-state.actors.NPC.positionMeters).toFixed(2)} m</b> · Alcance del ataque físico: 2 m</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <Fighter name={state.actors.PLAYER.name} side="PLAYER" state={state}/>
    <Fighter name={state.actors.NPC.name} side="NPC" state={state}/>
   </div>
   <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
    <label className="block text-sm font-semibold">Controlar
     <select value={side} onChange={e=>setSide(e.target.value as Side)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2">
      {view?.permissions.PLAYER&&<option value="PLAYER">{state.actors.PLAYER.name}</option>}
      {view?.permissions.NPC&&<option value="NPC">{state.actors.NPC.name}</option>}
     </select>
    </label>
    {pending?
      <p role="status" className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-amber-200">
       <b>Reacción pendiente:</b> {state.actors[pending.by].name} lanzó un ataque contra {state.actors[pending.against].name}.
       {defending?" Elige cómo responder.":" Esperando la decisión del defensor."}
      </p>:
      <p className="mt-4 text-sm text-zinc-400">
       {ready?"Puedes actuar.":"En espera: el oponente debe avanzar sus ticks o se agotaron tus PA."}
       {" "}El turno se comparte: 100 ticks y 9 + CON puntos de acción por combatiente. Si ambos tienen igual velocidad, alternan iniciativas (la defensa no consume iniciativa, pero sí PA y ticks). El NPC de entrenamiento actúa automáticamente.
      </p>}
    {state.status==="ACTIVE" && !pending && !ready && side==="PLAYER" && hasAccess
      && state.actors.NPC.characterId===null &&
      <button type="button" disabled={busy} onClick={()=>void submit({kind:"ADVANCE"})}
        className="mt-3 rounded-lg border border-amber-400 px-4 py-2 text-sm text-amber-200 disabled:opacity-40">
        Avanzar IA del NPC (si quedó esperando)
      </button>}
    {defending&&hasAccess&&<div className="mt-4 space-y-3">
     <h2 className="font-bold text-lg">Elige tu respuesta</h2>
     <div className="grid gap-2 sm:grid-cols-2">
      {options.map(opt=><label key={opt.value} className="flex gap-2 rounded-lg border border-zinc-700 p-3">
       <input type="radio" checked={defense===opt.value} onChange={()=>setDefense(opt.value)}/>
       <span><b>{opt.label}</b><small className="block text-zinc-400">{opt.description}</small></span>
      </label>)}
     </div>
     {defense==="DEFLECT"&&<label className="block text-sm">Orientación de la guardia: {angle}°
      <input className="mt-2 w-full" type="range" min="0" max="359" value={angle}
       onChange={e=>setAngle(Number(e.target.value))}/>
      <span className="block text-xs text-zinc-400">Alineación de desvío estimada: {Math.round(deflectionAlignment(pending.trajectory,angle)*100)}%</span>
     </label>}
     <button onClick={()=>void submit({kind:"DEFEND",defense,defenseAngle:angle})}
      disabled={busy} className="rounded-lg bg-amber-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
      {busy?"Resolviendo…":"Responder al ataque"}
     </button>
    </div>}
    {!pending&&state.status==="ACTIVE"&&hasAccess&&<div className="mt-5 space-y-4">
     <h2 className="text-lg font-bold">Siguiente acción</h2>
     <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Avanzar (máx. {maxMove} m)
       <input type="number" min="0" max={maxMove} step="0.5" value={meters}
        onChange={e=>setMeters(Number(e.target.value))}
        className="mt-1 block w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"/>
      </label>
      <select aria-label="Dirección del desplazamiento" value={moveDirection} onChange={e=>setMoveDirection(e.target.value as "TOWARD"|"AWAY")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="TOWARD">Acercarse</option><option value="AWAY">Alejarse</option></select>
      <button disabled={!ready} onClick={()=>void submit({kind:"MOVE",meters,direction:moveDirection})}
       className="rounded-lg border border-cyan-500 px-4 py-2 text-cyan-200 disabled:opacity-40">Mover</button>
      <button disabled={!ready} onClick={()=>void submit({kind:"WAIT"})}
       className="rounded-lg border border-zinc-500 px-4 py-2 disabled:opacity-40">Terminar turno</button>
     </div>
     <div className="rounded-xl border border-zinc-700 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
       <b>Dibuja la trayectoria del ataque</b>
       <button onClick={()=>setPoints(defaultPath)} className="rounded border border-zinc-600 px-3 py-1 text-xs">Restablecer</button>
      </div>
      <p className="mb-2 text-xs text-zinc-400">Arrastra el dedo o el cursor. La dirección final influye en la posibilidad de desviar el golpe.</p>
      <svg ref={canvas} viewBox="0 0 100 100" preserveAspectRatio="none"
       onPointerDown={startDraw} onPointerMove={continueDraw}
       onPointerUp={endDraw} onPointerCancel={endDraw}
       className="h-52 w-full touch-none rounded-lg bg-zinc-900"
       aria-label="Lienzo para dibujar la trayectoria del ataque">
       {Array.from({length:9},(_,i)=><line key={i} x1={(i+1)*10} x2={(i+1)*10} y1="0" y2="100" stroke="#3f3f46" strokeWidth="0.3"/>)}
       <polyline points={polyline} fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
       <circle cx={normalizedPath[0].x*100} cy={normalizedPath[0].y*100} r="2.5" fill="#34d399"/>
       <circle cx={normalizedPath.at(-1)!.x*100} cy={normalizedPath.at(-1)!.y*100} r="2.5" fill="#f59e0b"/>
      </svg>
      <div className="mt-3 flex flex-wrap items-end gap-3">
       <label className="text-sm">Tipo de ataque
        <select value={attackType} onChange={e=>setAttackType(e.target.value as typeof attackType)}
         className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
         <option value="CUT">Corte</option><option value="BLUNT">Contundente</option><option value="PIERCE">Penetración</option>
        </select>
       </label>
       <button disabled={!ready||points.length<2} onClick={()=>void submit({kind:"ATTACK",attackType,trajectory:normalizedPath})}
        className="rounded-lg bg-rose-400 px-5 py-2 font-bold text-zinc-950 disabled:opacity-40">
        Atacar
       </button>
      </div>
     </div>
    </div>}
   </section>
   <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
    <h2 className="mb-3 text-lg font-bold">Registro de combate</h2>
    {state.log.length===0?<p className="text-sm text-zinc-500">Aún no hay acciones.</p>:
     <ol className="max-h-96 space-y-2 overflow-auto text-sm">
      {state.log.slice().reverse().map((entry,index)=>
       <li key={state.log.length-index} className="border-b border-zinc-800 pb-2">
        <span className="text-zinc-500">Tick {entry.tick} · </span>{entry.summary}
        {entry.defense&&<span className="ml-2 text-cyan-300">[{entry.defense}]</span>}
        {entry.critical&&<strong className="ml-2 text-amber-300">¡Crítico!</strong>}
        {entry.knockbackMeters!==undefined&&entry.knockbackMeters>0&&
         <small className="ml-2 text-zinc-400">Desplazamiento: {entry.knockbackMeters} m</small>}
       </li>)}
     </ol>}
   </section>
  </>}
 </main>;
}
