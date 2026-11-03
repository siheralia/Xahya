"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import CombatSkillLoadout from "./CombatSkillLoadout";
import type {CombatSkillPreview} from "@/lib/combat/skill-preview";
import { BASIC_MAGIC_AREA_RADIUS, BASIC_MAGIC_MANA_COST, BASIC_MAGIC_RANGE_METERS, magicHintCells } from "@/lib/combat/magic-area";
import {
  actionPoints, canAct, defaultAttackSource, deflectionAlignment, effectiveCombatSpeed, physicalAttackStart, remainingAp, turnTicks, weaponForSource,
  type CombatCommand, type CombatState, type DefenseChoice, type PhysicalAttackSource, type Point, type Side,
} from "@/lib/combat/turn-engine";

type View = {state:CombatState;permissions:{PLAYER:boolean;NPC:boolean};
 canMove:{PLAYER:boolean;NPC:boolean}};
const options: Array<{value:DefenseChoice,label:string,description:string}> = [
 {value:"DODGE",label:"Esquivar",description:"Precisión vs Esquive"},
 {value:"BLOCK",label:"Bloquear",description:"STR vs CON; desgaste del arma"},
 {value:"ENDURE",label:"Resistir",description:"STR vs CON"},
 {value:"REPEL",label:"Repeler",description:"STR vs STR; empuje"},
 {value:"DEFLECT",label:"Desviar",description:"STR vs AGI y orientación de guardia"},
 {value:"MAGIC_FIELD",label:"Campo defensivo mágico",description:"DEF mágica vs ataque mágico y ventajas por tipo de campo"},
 {value:"NONE",label:"No reaccionar",description:"Recibir el impacto sin respuesta activa"},
];
const defaultPath:Point[]=[{x:0.1,y:0.5},{x:0.9,y:0.5}];
const attackNames={CUT:"Corte",BLUNT:"Contundente",PIERCE:"Penetración"} as const;
const fieldNames={CONCENTRATED:"Concentrada",DISPERSED:"Dispersa",SOLID:"Sólida"} as const;
function attackDirection(points:Point[]):string {
 const first=points[points.length-2],last=points[points.length-1];
 if(!first||!last)return "indeterminada";
 const x=Math.abs(last.x-first.x),y=Math.abs(last.y-first.y);
 return x>y*1.8?"lateral":y>x*1.8?"vertical":"diagonal";
}
function guardHint(alignment:number):string {
 if(alignment>=0.75)return "Favorable";
 if(alignment>=0.45)return "Intermedia";
 return "Desfavorable";
}
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
   <span>Integridad: {f.weaponIntegrity}/100</span>
   <span className="col-span-2">Mano principal: {f.equippedWeapon?.name??"Libre"}</span>
   <span className="col-span-2">Mano secundaria: {f.offhandWeapon?.name??"Libre"}</span>
   <span>Masa: {f.massKg} kg</span>
   {state.mana?.[side]&&<span className="font-semibold text-violet-300">Maná combate: {state.mana[side].current}/{state.mana[side].max}</span>}
  </div>
 </div>;
}
export default function CombatEncounter({id}:{id:string}) {
 const [view,setView]=useState<View|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [shareStatus,setShareStatus]=useState("");
 const [side,setSide]=useState<Side>("PLAYER");
 const [attackSource,setAttackSource]=useState<PhysicalAttackSource>("MAIN_HAND");
 const [recoverSlot,setRecoverSlot]=useState<"MAIN_HAND"|"OFF_HAND">("MAIN_HAND");
 const [attackMode,setAttackMode]=useState<"PHYSICAL"|"MAGIC_AREA"|"RANGED"|"THROW">("PHYSICAL");

 const [areaCenter,setAreaCenter]=useState<Point|null>(null);
 const [predictedCenter,setPredictedCenter]=useState<Point|null>(null);
 const [meters,setMeters]=useState(1);
 const [moveDirection,setMoveDirection]=useState<"TOWARD"|"AWAY"|"WEAPON">("TOWARD");
 const [points,setPoints]=useState<Point[]>(defaultPath);
 const [drawing,setDrawing]=useState(false);
 const [defense,setDefense]=useState<DefenseChoice>("DODGE");
 const [dodgeDirection,setDodgeDirection]=useState<"AWAY"|"TOWARD"|"WEAPON">("AWAY");
 const [angle,setAngle]=useState(90);
 const [flash,setFlash]=useState(false);
 const lastResolution=useRef("");
 const canvas=useRef<SVGSVGElement|null>(null);
 const castRequestRef=useRef<{key:string;id:string}|null>(null);
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
   if(command.kind==="DEFEND")setPredictedCenter(null);
   if(command.kind==="CAST_SKILL")castRequestRef.current=null;
   const evt=(data.state as CombatState).log.filter(e=>e.kind==="RESOLVE").at(-1);
   if(evt && evt.tick+":"+evt.summary+":"+evt.defense!==lastResolution.current) {
    setFlash(true);window.setTimeout(()=>setFlash(false),330);
    lastResolution.current=evt.tick+":"+evt.summary+":"+evt.defense;
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo realizar la acción.");}
  finally{setBusy(false);}
 }
 function toPoint(e:PointerEvent<SVGSVGElement>):Point {
  const rect=e.currentTarget.getBoundingClientRect();
  if(!rect.width||!rect.height)return {x:0.5,y:0.5};
  return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
    y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
 }
 function startDraw(e:PointerEvent<SVGSVGElement>) {
  // Read the SVG's currentTarget synchronously, while React's pointer event
  // is still active. Deferred state updater callbacks must never access it.
  const point=toPoint(e);
  if(attackMode!=="PHYSICAL" || displayedAttackType==="PIERCE"){setAreaCenter(point);if(attackMode==="PHYSICAL")setPoints(physicalAnchor?[physicalAnchor,point]:[point,point]);return;}
  try { e.currentTarget.setPointerCapture(e.pointerId); }
  catch { /* Some mobile browsers do not support SVG pointer capture. */ }
  setDrawing(true);
  setPoints(physicalAnchor?[physicalAnchor,point]:[point]);
 }
 function continueDraw(e:PointerEvent<SVGSVGElement>) {
  if(attackMode!=="PHYSICAL"||displayedAttackType==="PIERCE"||!drawing)return;
  const point=toPoint(e);
  setPoints(previous=>previous.length>=79?previous:[...previous,point]);
 }
 function endDraw(e:PointerEvent<SVGSVGElement>) {
  if(attackMode!=="PHYSICAL"||displayedAttackType==="PIERCE"||!drawing)return;
  const point=toPoint(e);
  setDrawing(false);
  setPoints(previous=>previous.length<2?[...previous,point]:previous);
 }
 const state=view?.state;
 const isPvp=state?.actors.NPC.characterId!==null && state?.actors.NPC.characterId!==undefined;
 async function shareEncounter(){
  try {
   await navigator.clipboard.writeText(window.location.href);
   setShareStatus("Enlace copiado. Compártelo con el otro jugador.");
  }catch{
   setShareStatus("Copia la dirección de esta página y envíasela al otro jugador.");
  }
 }
 const tiedSpeed=!!state&&effectiveCombatSpeed(state.actors.PLAYER)===effectiveCombatSpeed(state.actors.NPC);
 const actor=state?.actors[side];
 const pending=state?.pending;
 const activeAttackSource:PhysicalAttackSource=actor&&(
   (attackSource==="MAIN_HAND"&&!actor.equippedWeapon)||(attackSource==="OFF_HAND"&&!actor.offhandWeapon)
 )?defaultAttackSource(actor):attackSource;
 const selectedWeapon=actor?weaponForSource(actor,activeAttackSource):undefined;
 const displayedAttackType=attackMode==="MAGIC_AREA"?(actor?.attackType??"CUT"):(selectedWeapon?.attackType??"BLUNT");
 const physicalAnchor=state?physicalAttackStart(state,side,activeAttackSource):null;
 const droppedForActor=state?.droppedWeapons?.filter(w=>w.owner===side)??[];
 const activeRecoverSlot=droppedForActor.some(w=>(w.slot??"MAIN_HAND")===recoverSlot)
   ?recoverSlot:(droppedForActor[0]?.slot??"MAIN_HAND");
 // Refresh the stroke origin after a paid physical attack or displacement,
 // including when the encounter is reloaded after signing back in.
 useEffect(()=>{
  setDrawing(false);
  setPoints(physicalAnchor?[physicalAnchor,physicalAnchor]:defaultPath);
 },[side,activeAttackSource,physicalAnchor?.x,physicalAnchor?.y]);
 const selectedDefense=pending?.usesMagic
  ? (["BLOCK","REPEL","DEFLECT"].includes(defense)?"DODGE":defense)
  : (defense==="MAGIC_FIELD"?"DODGE":defense);
 const hasAccess=view?.permissions[side]??false;
 const defending=!!pending&&pending.against===side;
 const ready=!!state&&hasAccess&&canAct(state,side)&&!busy;
 const maxMove=actor?Math.max(1,Math.round(actor.race/10)):1;
 const normalizedPath=physicalAnchor
   ? [physicalAnchor,...(points.length>1?points.slice(1):[physicalAnchor])]
   : points.length>1?points:defaultPath;
 function castSkill(skill:CombatSkillPreview){
  const key=side+":"+skill.id+":"+state?.round;
  const previous=castRequestRef.current;
  const requestId=previous?.key===key?previous.id:crypto.randomUUID();
  castRequestRef.current={key,id:requestId};
  void submit({kind:"CAST_SKILL",skillId:skill.id,requestId,
   trajectory:skill.usesMagic?undefined:normalizedPath,
   areaCenter:skill.usesMagic?areaCenter??undefined:undefined});
 }
 const hint=pending?.areaHint??"centro";
 const warningCells=magicHintCells(hint);
 const polyline=normalizedPath.map(p=>(p.x*100).toFixed(1)+","+(p.y*100).toFixed(1)).join(" ");
 return <main className="mx-auto max-w-5xl px-4 py-7 text-zinc-100">
  {state?.droppedWeapons?.length ? <p className="mb-3 text-sm text-amber-200">Armas arrojadas pendientes de recuperar: {state.droppedWeapons.map(w=>w.weapon.name+" ("+state.actors[w.owner].name+")").join(", ")}. Puedes desplazarte hacia ellas y recogerlas durante el encuentro.</p> : null}
  {flash&&<div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[3000] bg-rose-200/50"/>}
  <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
   <h1 className="text-2xl font-bold">⚔️ Encuentro #{id}</h1>
   <div className="flex flex-wrap items-center gap-3">
    {isPvp&&<button type="button" onClick={()=>void shareEncounter()}
      className="rounded-lg border border-cyan-500/70 px-3 py-2 text-sm text-cyan-200">
      Compartir encuentro PvP
    </button>}
    <Link className="text-cyan-300" href="/combat">Nuevo encuentro</Link>
   </div>
  </div>
  {error&&<p role="alert" className="mb-4 rounded-lg border border-rose-600/50 p-3 text-rose-300">{error}</p>}
  {shareStatus&&<p role="status" className="mb-3 text-sm text-cyan-300">{shareStatus}</p>}
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
       <b>Reacción pendiente:</b> {state.actors[pending.by].name} lanzó {pending.usesMagic?<>una explosión mágica básica de <b>{attackNames[pending.attackType]}</b></>:<>un ataque de <b>{attackNames[pending.attackType]}</b></>} contra {state.actors[pending.against].name}.
       {" "}{pending.usesMagic?<>Región aproximada: <b>{hint}</b> (cuatro casillas resaltadas). El centro exacto está oculto.</>:<>Trayectoria aparente: <b>{attackDirection(pending.trajectory)}</b>.</>}
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
      {options.filter(opt=>pending.usesMagic
        ? ["DODGE","MAGIC_FIELD","ENDURE","NONE"].includes(opt.value)
        : opt.value!=="MAGIC_FIELD").map(opt=><label key={opt.value} className="flex gap-2 rounded-lg border border-zinc-700 p-3">
       <input type="radio" disabled={opt.value==="MAGIC_FIELD"&&(state.mana?.[side]?.current??0)<1} checked={selectedDefense===opt.value} onChange={()=>setDefense(opt.value)}/>
       <span><b>{opt.label}{opt.value==="MAGIC_FIELD"
         ? " ("+fieldNames[actor?.magicFieldType??"CONCENTRATED"]+")":""}</b>
        <small className="block text-zinc-400">{opt.description}</small>
        {opt.value==="MAGIC_FIELD"&&actor?.magicFieldDescription&&
          <small className="mt-1 block text-zinc-400">{actor.magicFieldDescription}</small>}
       </span>
      </label>)}
     </div>
     {(pending.usesMagic||pending.rangedPhysical)&&["DODGE","DEFLECT"].includes(selectedDefense)&&<div className="space-y-2">
      <p className="text-sm text-zinc-300">{pending.rangedPhysical?"Predice el impacto del proyectil para esquivar o interceptarlo; NO marques una zona segura.":"Predice el centro del ataque mágico: debes señalar dónde crees que está, NO dónde estarías a salvo."} Toca el terreno para marcarlo. La región resaltada es una pista, no el punto exacto; acertar la predicción también requiere superar la tirada defensiva.</p>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        onPointerDown={e=>setPredictedCenter(toPoint(e))}
        className="aspect-square w-full max-w-xl cursor-crosshair touch-none rounded-lg border border-amber-500/40 bg-zinc-900"
        aria-label="Terreno grande para predecir el centro de la explosión mágica">
        {Array.from({length:9},(_,i)=><rect key={i} x={(i%3)*100/3}
          y={Math.floor(i/3)*100/3} width={100/3} height={100/3}
          fill={warningCells.includes(i)?"#fbbf24":"#334155"}
          fillOpacity={warningCells.includes(i)?0.24:0.09}
          stroke="#64748b" strokeWidth={0.35}/>)}
        {predictedCenter&&<>
          <circle cx={predictedCenter.x*100} cy={predictedCenter.y*100}
            r={BASIC_MAGIC_AREA_RADIUS*100} fill="#38bdf8" fillOpacity={0.16}
            stroke="#7dd3fc" strokeDasharray="3 2" strokeWidth={1}/>
          <circle cx={predictedCenter.x*100} cy={predictedCenter.y*100} r={2.5} fill="#7dd3fc"/>
        </>}
      </svg>
      <p className="text-xs text-zinc-400">{predictedCenter?"Predicción marcada. Puedes cambiarla tocando otro punto.":"Aún no has señalado el posible impacto."}</p>
     </div>}
     {selectedDefense==="DEFLECT"&&<label className="block text-sm">Orientación de la guardia: {angle}°
      <input className="mt-2 w-full" type="range" min="0" max="359" value={angle}
       onChange={e=>setAngle(Number(e.target.value))}/>
      <span className="block text-xs text-zinc-400">Orientación aproximada: {guardHint(deflectionAlignment(pending.trajectory,angle))}. No garantiza desviar el golpe; también intervienen tu agilidad, la fuerza rival y la tirada.</span>
     </label>}
     {selectedDefense==="DODGE"&&dodgeDirection==="WEAPON"&&droppedForActor.length>1&&
      <label className="block text-sm">Arma hacia la que esquivar
       <select value={activeRecoverSlot} onChange={e=>setRecoverSlot(e.target.value as "MAIN_HAND"|"OFF_HAND")}
         className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
         {droppedForActor.map(w=><option key={"dodge-"+(w.slot??"MAIN_HAND")} value={w.slot??"MAIN_HAND"}>{w.weapon.name} · {w.slot==="OFF_HAND"?"Secundaria":"Principal"}</option>)}
       </select>
      </label>}
     {selectedDefense==="DODGE"&&<label className="block text-sm">Desplazamiento al esquivar
       <select value={dodgeDirection} onChange={e=>setDodgeDirection(e.target.value as "AWAY"|"TOWARD"|"WEAPON")} className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
         <option value="AWAY">Alejarse</option><option value="TOWARD">Acercarse</option>
         {state.droppedWeapons?.some(w=>w.owner===side)&&<option value="WEAPON">Hacia el arma arrojada</option>}
       </select>
     </label>}
     <button onClick={()=>void submit({kind:"DEFEND",defense:selectedDefense,defenseAngle:angle,weaponSlot:dodgeDirection==="WEAPON"?activeRecoverSlot:undefined,dodgeDirection:selectedDefense==="DODGE"?dodgeDirection:undefined,
        predictedCenter:(pending.usesMagic||pending.rangedPhysical)&&["DODGE","DEFLECT"].includes(selectedDefense)?predictedCenter??undefined:undefined})}
      disabled={busy||((pending.usesMagic||pending.rangedPhysical)&&["DODGE","DEFLECT"].includes(selectedDefense)&&!predictedCenter)} className="rounded-lg bg-amber-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
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
      <select aria-label="Dirección del desplazamiento" value={moveDirection} onChange={e=>setMoveDirection(e.target.value as "TOWARD"|"AWAY"|"WEAPON")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="TOWARD">Acercarse</option><option value="AWAY">Alejarse</option>{state?.droppedWeapons?.some(w=>w.owner===side)&&<option value="WEAPON">Ir hacia arma arrojada</option>}</select>
      {moveDirection==="WEAPON"&&droppedForActor.length>1&&<select aria-label="Arma por recuperar"
        value={activeRecoverSlot} onChange={e=>setRecoverSlot(e.target.value as "MAIN_HAND"|"OFF_HAND")}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
        {droppedForActor.map(w=><option key={(w.slot??"MAIN_HAND")+w.weapon.name} value={w.slot??"MAIN_HAND"}>{w.weapon.name} · {w.slot==="OFF_HAND"?"Secundaria":"Principal"}</option>)}
      </select>}
      <button disabled={!ready} onClick={()=>void submit({kind:"MOVE",meters,direction:moveDirection,weaponSlot:moveDirection==="WEAPON"?activeRecoverSlot:undefined})}
       className="rounded-lg border border-cyan-500 px-4 py-2 text-cyan-200 disabled:opacity-40">Mover</button>
      <button disabled={!ready} onClick={()=>void submit({kind:"WAIT"})}
       className="rounded-lg border border-zinc-500 px-4 py-2 disabled:opacity-40">Terminar turno</button>
     </div>
     <p className="text-sm text-zinc-300">Distancia al oponente: <b>{Math.abs(state.actors.PLAYER.positionMeters-state.actors.NPC.positionMeters).toFixed(2)} m</b>
       {" · "}{selectedWeapon?<>Alcance de {selectedWeapon.name}: <b>{selectedWeapon.effectiveRangeMeters}–{selectedWeapon.maximumRangeMeters??selectedWeapon.effectiveRangeMeters} m</b>
         {selectedWeapon.throwable&&<>{" · "}Arrojar: {selectedWeapon.throwRangeMeters} m</>}</>
         :<>Alcance de puño: <b>{(actor?.unarmedReachMeters??Math.max(0.3,(actor?.heightMeters??1.7)*0.45)).toFixed(2)} m</b></>}
       {" · "}Magia básica: {BASIC_MAGIC_RANGE_METERS} m
     </p>
     <div className="rounded-xl border border-zinc-700 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
       <b>{attackMode==="MAGIC_AREA"?(displayedAttackType==="CUT"?"Elige el centro de la línea mágica":displayedAttackType==="PIERCE"?"Elige la punta mágica":"Elige el centro de la explosión"):displayedAttackType==="PIERCE"?"Marca el punto de perforación":displayedAttackType==="BLUNT"?"Dibuja un golpe contundente rígido":"Dibuja la trayectoria del corte"}</b>
       <button onClick={()=>{setPoints(physicalAnchor?[physicalAnchor,physicalAnchor]:defaultPath);setAreaCenter(null);}} className="rounded border border-zinc-600 px-3 py-1 text-xs">Restablecer</button>
      </div>
      <label className="mb-3 block text-sm">Modalidad
        <select value={attackMode} onChange={e=>setAttackMode(e.target.value as "PHYSICAL"|"MAGIC_AREA"|"RANGED"|"THROW")}
          className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
          <option value="PHYSICAL">Ataque físico cuerpo a cuerpo</option>
          {selectedWeapon?.mode==="RANGED"&&<option value="RANGED">Proyectil físico ({selectedWeapon.name})</option>}
          {selectedWeapon?.throwable&&<option value="THROW">Arrojar arma ({selectedWeapon.name})</option>}
          <option value="MAGIC_AREA">Explosión mágica básica (área)</option>
        </select>
      </label>
      {attackMode!=="MAGIC_AREA"&&<label className="mb-3 block text-sm">Arma o mano para atacar
        <select value={activeAttackSource} onChange={e=>{
          const source=e.target.value as PhysicalAttackSource;
          setAttackSource(source);setAreaCenter(null);
          setAttackMode(actor&&weaponForSource(actor,source)?.mode==="RANGED"?"RANGED":"PHYSICAL");
        }} className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
          {actor?.equippedWeapon&&<option value="MAIN_HAND">Principal · {actor.equippedWeapon.name} · {attackNames[actor.equippedWeapon.attackType]}</option>}
          {actor?.offhandWeapon&&<option value="OFF_HAND">Secundaria · {actor.offhandWeapon.name} · {attackNames[actor.offhandWeapon.attackType]}</option>}
          <option value="FIST_RIGHT">Puño derecho · Contundente</option>
          <option value="FIST_LEFT">Puño izquierdo · Contundente</option>
        </select>
      </label>}
      <p className="mb-2 text-xs text-zinc-400">{attackMode==="MAGIC_AREA"
       ? "Toca una posición: el punto será el epicentro y el círculo la zona de explosión. El defensor solo verá la región aproximada. Ataque básico con coste temporal normal y "+BASIC_MAGIC_MANA_COST+" de maná en esta fase; las habilidades con maná llegan en fase 2."
       : physicalAnchor
        ? "Esta arma o mano continúa desde su último ataque (punto verde). Cambiar de arma o mano conserva su propia trayectoria."
        : "Arrastra el dedo o el cursor. La dirección final influye en la posibilidad de desviar el golpe."}</p>
      {attackMode!=="MAGIC_AREA"&&<p className="mb-2 text-xs text-rose-200">El objetivo está marcado en rojo. El corte debe cruzarlo; el golpe y la perforación deben terminar dentro de su zona. Fuera del alcance efectivo disminuye la precisión.</p>}
      <svg ref={canvas} viewBox="0 0 100 100" preserveAspectRatio={attackMode!=="PHYSICAL"?"xMidYMid meet":"none"}
       onPointerDown={startDraw} onPointerMove={continueDraw}
       onPointerUp={endDraw} onPointerCancel={endDraw}
       className={attackMode!=="PHYSICAL"?"aspect-square w-full max-w-md cursor-crosshair touch-none rounded-lg bg-zinc-900":"h-52 w-full touch-none rounded-lg bg-zinc-900"}
       aria-label="Lienzo para dibujar la trayectoria del ataque">
       {Array.from({length:9},(_,i)=><line key={i} x1={(i+1)*10} x2={(i+1)*10} y1="0" y2="100" stroke="#3f3f46" strokeWidth="0.3"/>)}
       {attackMode!=="MAGIC_AREA"&&<circle cx="50" cy="50" r={displayedAttackType==="BLUNT"?16:displayedAttackType==="CUT"?10:6.5}
         stroke="#fb7185" strokeWidth="0.9" strokeDasharray="2 2" fill="#fb7185" fillOpacity={0.08}/>}
       {attackMode!=="MAGIC_AREA"&&<circle cx="50" cy="50" r="1.2" fill="#fb7185"/>}
       {attackMode!=="PHYSICAL"?
        areaCenter&&<>
          {displayedAttackType==="CUT"&&<line x1={Math.max(0,areaCenter.x*100-25)} y1={areaCenter.y*100} x2={Math.min(100,areaCenter.x*100+25)} y2={areaCenter.y*100} stroke="#e9d5ff" strokeWidth="4" strokeLinecap="round"/>}
          <circle cx={areaCenter.x*100} cy={areaCenter.y*100}
            r={((attackMode==="RANGED"||attackMode==="THROW")?(displayedAttackType==="BLUNT"?0.12:displayedAttackType==="CUT"?0.085:0.045):displayedAttackType==="BLUNT"?BASIC_MAGIC_AREA_RADIUS:displayedAttackType==="CUT"?0.06:0.035)*100} fill="#c084fc" fillOpacity={0.3}
            stroke="#e9d5ff" strokeWidth={1.1}/>
          <circle cx={areaCenter.x*100} cy={areaCenter.y*100} r={2.3} fill="#f5d0fe"/>
        </>
        :<>
          {displayedAttackType==="PIERCE"?<circle cx={normalizedPath.at(-1)!.x*100} cy={normalizedPath.at(-1)!.y*100} r="2.5" stroke="#22d3ee" fill="#22d3ee" />:<polyline points={displayedAttackType==="BLUNT"?`${normalizedPath[0].x*100},${normalizedPath[0].y*100} ${normalizedPath.at(-1)!.x*100},${normalizedPath.at(-1)!.y*100}`:polyline} fill="none" stroke="#22d3ee" strokeWidth={displayedAttackType==="BLUNT"?4:1.8} strokeLinecap="round" strokeLinejoin="round"/>}
          <circle cx={normalizedPath[0].x*100} cy={normalizedPath[0].y*100} r="2.5" fill="#34d399"/>
          <circle cx={normalizedPath.at(-1)!.x*100} cy={normalizedPath.at(-1)!.y*100} r="2.5" fill="#f59e0b"/>
        </>}
      </svg>
      <div className="mt-3 flex flex-wrap items-end gap-3">
       <div className="text-sm">{attackMode==="MAGIC_AREA"?"Tipo de magia básica":"Tipo de ataque físico"}
        <div className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">{attackNames[displayedAttackType]}
          <span className="ml-2 text-xs text-zinc-400">Configurado en la ficha o el arma</span>
        </div>
       </div>
       <button disabled={!ready||(attackMode==="RANGED"&&selectedWeapon?.mode!=="RANGED")||(attackMode==="THROW"&&!selectedWeapon?.throwable)||(attackMode==="PHYSICAL"&&selectedWeapon?.mode==="RANGED")||(attackMode!=="PHYSICAL"?!areaCenter:points.length<2)||(attackMode==="MAGIC_AREA"&&(state?.mana?.[side]?.current??0)<BASIC_MAGIC_MANA_COST)}
         onClick={()=>void submit(attackMode==="MAGIC_AREA"
           ? {kind:"ATTACK",usesMagic:true,attackType:actor?.attackType??"CUT",areaCenter:areaCenter??undefined}
           : attackMode==="THROW"?{kind:"ATTACK",throwWeapon:true,attackSource:activeAttackSource,attackType:displayedAttackType,areaCenter:areaCenter??undefined}
           : attackMode==="RANGED"?{kind:"ATTACK",rangedPhysical:true,attackSource:activeAttackSource,attackType:displayedAttackType,areaCenter:areaCenter??undefined}
           : {kind:"ATTACK",attackSource:activeAttackSource,attackType:displayedAttackType,trajectory:normalizedPath})}
         className="rounded-lg bg-rose-400 px-5 py-2 font-bold text-zinc-950 disabled:opacity-40">
        {attackMode==="MAGIC_AREA"?"Lanzar magia":attackMode==="RANGED"?"Disparar proyectil":attackMode==="THROW"?"Arrojar arma":"Atacar"}
       </button>
      </div>
     </div>
    </div>}
   </section>
   {isPvp&&<p className="mt-4 text-xs text-zinc-400">PvP compartido: el dueño de cada personaje abre esta misma URL en su cuenta. Las acciones aparecen aproximadamente cada 3,5 segundos; no hay invitaciones automáticas todavía.</p>}
   <CombatSkillLoadout encounterId={id} side={side} authorized={hasAccess}
    canUseSkill={ready} busy={busy} round={state.round}
    mana={state.mana?.[side]?.current??null}
    cooldowns={state.skillCooldowns?.[side]??{}}
    onCast={castSkill} aimMode={attackMode==="MAGIC_AREA"?"MAGIC_AREA":"PHYSICAL"} magicAimReady={areaCenter!==null}/>
   <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
    <h2 className="mb-3 text-lg font-bold">Registro de combate</h2>
    {state.log.length===0?<p className="text-sm text-zinc-500">Aún no hay acciones.</p>:
     <ol className="max-h-96 space-y-2 overflow-auto text-sm">
      {state.log.slice().reverse().map((entry,index)=>
       <li key={state.log.length-index} className="border-b border-zinc-800 pb-2">
        <span className="text-zinc-500">Tick {entry.tick} · </span>{entry.summary}
        {entry.defense&&<span className="ml-2 text-cyan-300">[{entry.defense==="MAGIC_FIELD"?"Campo mágico":entry.defense}]</span>}
        {entry.critical&&<strong className="ml-2 text-amber-300">¡Crítico!</strong>}
        {entry.knockbackMeters!==undefined&&entry.knockbackMeters>0&&
         <small className="ml-2 text-zinc-400">Desplazamiento: {entry.knockbackMeters} m</small>}
        {entry.kind==="RESOLVE"&&entry.areaCenter&&
         <div className="mt-2 max-w-[200px]">
          <p className="text-xs text-zinc-400">Explosión revelada (morado){entry.predictedCenter?" · predicción (azul)":""}</p>
          <svg viewBox="0 0 100 100" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900" aria-label="Resultado de predicción e impacto mágico">
           <circle cx={entry.areaCenter.x*100} cy={entry.areaCenter.y*100} r={BASIC_MAGIC_AREA_RADIUS*100}
             fill="#c084fc" fillOpacity={0.4} stroke="#e9d5ff" strokeWidth={1}/>
           <circle cx={entry.areaCenter.x*100} cy={entry.areaCenter.y*100} r={2} fill="#f5d0fe"/>
           {entry.predictedCenter&&<circle cx={entry.predictedCenter.x*100} cy={entry.predictedCenter.y*100} r={2.8} fill="#38bdf8"/>}
          </svg>
         </div>}
       </li>)}
     </ol>}
   </section>
  </>}
 </main>;
}
