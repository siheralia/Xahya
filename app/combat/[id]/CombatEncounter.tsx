"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import CombatSkillLoadout from "./CombatSkillLoadout";
import CombatCharacterHud, {type CombatPanel} from "./CombatCharacterHud";
import CombatDialog from "./CombatDialog";
import {Footprints, Shield, ShieldCheck, Hand, Swords, WandSparkles, Box, Ban, Sparkles, Activity, Target, RefreshCw, Plus, MoveUpRight, Send, Undo2} from "lucide-react";
import { narrateCombat } from "@/lib/combat/narration";
import type {CombatSkillPreview} from "@/lib/combat/skill-preview";
import { BASIC_MAGIC_AREA_RADIUS, BASIC_MAGIC_MANA_COST, BASIC_MAGIC_RANGE_METERS, magicHintCells } from "@/lib/combat/magic-area";
import {
  actionPoints, canAct, defaultAttackSource, deflectionAlignment, effectiveCombatSpeed, effectiveWeaponReachMeters, physicalAttackStart, remainingAp, turnTicks, weaponForSource,
  type CombatCommand, type CombatState, type DefenseChoice, type PhysicalAttackSource, type Point, type Side,
} from "@/lib/combat/turn-engine";

type View = {state:CombatState;karma?:Partial<Record<Side,number>>;
 boostStats?:Array<{key:string;label:string}>;permissions:{PLAYER:boolean;NPC:boolean};
 canMove:{PLAYER:boolean;NPC:boolean}};
const options: Array<{value:DefenseChoice,label:string,description:string}> = [
 {value:"DODGE",label:"Esquivar",description:"Precisión vs Esquive"},
 {value:"BLOCK",label:"Bloquear",description:"STR vs CON; desgaste del arma"},
 {value:"ENDURE",label:"Resistir",description:"STR vs CON"},
 {value:"REPEL",label:"Repeler",description:"STR vs STR; empuje"},
 {value:"DEFLECT",label:"Desviar",description:"STR vs AGI y orientación de guardia"},
 {value:"MAGIC_FIELD",label:"Campo defensivo mágico",description:"DEF mágica vs ataque mágico y ventajas por tipo de campo"},
 {value:"CONSTRUCTION",label:"Bloque de construcción",description:"Interceptar usando una barrera colocada en el terreno"},
 {value:"NONE",label:"No reaccionar",description:"Recibir el impacto sin respuesta activa"},
];
const defenseIcons:Record<DefenseChoice,typeof Footprints>={
 DODGE:Footprints,BLOCK:Shield,ENDURE:ShieldCheck,REPEL:MoveUpRight,
 DEFLECT:Swords,MAGIC_FIELD:WandSparkles,CONSTRUCTION:Box,NONE:Ban,
};
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
 const [hudOpen,setHudOpen]=useState(false);
 const [panel,setPanel]=useState<CombatPanel>("none");
 const [skillCategory,setSkillCategory]=useState<string|null>(null);
 const [characterData,setCharacterData]=useState<any>(null);
 const [characterDataError,setCharacterDataError]=useState("");
 const [advancingNpc,setAdvancingNpc]=useState(false);
 const lastNpcAdvance=useRef("");
 const openPanel=useCallback((next:CombatPanel,category:string|null=null)=>{
  setPanel(next);if(next==="skills")setSkillCategory(category);
  setHudOpen(false);
 },[]);
 const closePanel=useCallback(()=>setPanel("none"),[]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [shareStatus,setShareStatus]=useState("");
 const [actionFeedback,setActionFeedback]=useState("");
 const [narrativeCopyStatus,setNarrativeCopyStatus]=useState("");
 const [side,setSide]=useState<Side>("PLAYER");
 const [attackSource,setAttackSource]=useState<PhysicalAttackSource>("MAIN_HAND");
 const [recoverSlot,setRecoverSlot]=useState<"MAIN_HAND"|"OFF_HAND">("MAIN_HAND");
 const [attackMode,setAttackMode]=useState<"PHYSICAL"|"MAGIC_AREA"|"RANGED"|"THROW">("PHYSICAL");

 const [areaCenter,setAreaCenter]=useState<Point|null>(null);
 const [constructionCenter,setConstructionCenter]=useState<Point|null>(null);
 const [constructionMaterials,setConstructionMaterials]=useState<Partial<Record<Side,string[]>>>({});
 const [constructionSkills,setConstructionSkills]=useState<Partial<Record<Side,CombatSkillPreview[]>>>({});
 const [constructionForm,setConstructionForm]=useState<"FIELD"|"BLOCK">("FIELD");
 const [constructionLabel,setConstructionLabel]=useState("");
 const [attackTargetId,setAttackTargetId]=useState("");
 const [karmaAllocation,setKarmaAllocation]=useState<Record<string,number>>({});
 const [defenseConstruction,setDefenseConstruction]=useState("");
 const karmaRequestRef=useRef<{key:string;id:string}|null>(null);
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
   setView(previous=>previous?.state.status==="FINISHED"&&data.state.status!=="FINISHED"?previous:data);
   if(!data.permissions.PLAYER&&data.permissions.NPC)setSide("NPC");
   const events=(data.state as CombatState).log;
   const last=events.filter(e=>e.kind==="RESOLVE").at(-1);
   const key=last?last.tick+":"+last.summary+":"+last.defense:"";
   if(key&&lastResolution.current&&key!==lastResolution.current) {
    setFlash(true);
    window.setTimeout(()=>setFlash(false),330);
   }
   if(key)lastResolution.current=key;
   // A successful background poll must never erase a rejected player action.
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el combate.");}
 },[id]);
 const onConstructionMaterialsChange=useCallback((owner:Side,materials:string[])=>{
  setConstructionMaterials(previous=>({...previous,[owner]:materials}));
 },[]);
 const onConstructionSkillsChange=useCallback((owner:Side,skills:CombatSkillPreview[])=>{
  setConstructionSkills(previous=>({...previous,[owner]:skills}));
 },[]);
 const encounterFinished=view?.state.status==="FINISHED";
 useEffect(()=>{
  if(encounterFinished)return; // Once FINISHED, no more background requests.
  void load();
  const handle=window.setInterval(()=>{void load();},3500);
  return ()=>window.clearInterval(handle);
 },[load,encounterFinished]);
 async function submit(command:CombatCommand | {kind:"ADVANCE"}) {
  if(busy)return;
  setBusy(true);setError("");setActionFeedback("");
  try {
   const r=await fetch("/api/combat/"+id+"/actions",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({side,command}),
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Acción rechazada");
   setView(v=>v?{...v,state:data.state}:v);
   if(command.kind==="BOOST_KARMA"){setKarmaAllocation({});karmaRequestRef.current=null;void load();}
   if(command.kind==="DEFEND")setPredictedCenter(null);
   if(command.kind==="CAST_SKILL"){
    castRequestRef.current=null;
    const event=(data.state as CombatState).log.filter(e=>e.skillId===command.skillId).at(-1);
    setActionFeedback(event?.summary??"Habilidad ejecutada. Revisa el registro de combate.");
    setPanel("none");setConstructionCenter(null);
   }else if(command.kind==="BOOST_KARMA"){
    setActionFeedback("Mini boost aplicado: el karma se descontó y los bonos duran este combate.");
    setPanel("none");
   }
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
 const opposingSide:Side=side==="PLAYER"?"NPC":"PLAYER";
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
 const hasAvailableBlock=state?.constructions?.some(c=>c.owner===side&&c.form==="BLOCK"&&(c.durability??0)>0&&Math.hypot(c.center.x-0.5,c.center.y-0.5)<=0.35);
 const selectedDefense=(defense==="CONSTRUCTION"&&!hasAvailableBlock)?"DODGE":pending?.usesMagic
  ? (["BLOCK","REPEL","DEFLECT"].includes(defense)?"DODGE":defense)
  : (defense==="MAGIC_FIELD"?"DODGE":defense);
 const hasAccess=view?.permissions[side]??false;
 useEffect(()=>{
  const characterId=actor?.characterId;
  if(!hasAccess||!characterId){setCharacterData(null);setCharacterDataError("");return;}
  let active=true;
  setCharacterData(null);setCharacterDataError("");
  fetch("/api/characters/"+characterId,{cache:"no-store"})
   .then(async response=>{
    const data=await response.json();
    if(!response.ok)throw new Error(data?.error??"No se pudieron cargar datos de ficha.");
    if(active)setCharacterData(data);
   }).catch(e=>{if(active)setCharacterDataError(e instanceof Error?e.message:"Datos de ficha no disponibles.");});
  return ()=>{active=false;};
 },[actor?.characterId,hasAccess]);

 const creationMaterials=constructionMaterials[side]??[];
 const canCreateObjects=hasAccess&&creationMaterials.length>0;
 const canCreateMaterialBlocks=creationMaterials.some(material=>material!=="LIGHT"&&material!=="MIRROR");
 const enemyMirrors=state?.constructions?.filter(c=>c.owner!==side&&c.form==="MIRROR"&&(c.durability??0)>0)??[];
 const selectedAttackTargetId=enemyMirrors.some(c=>c.id===attackTargetId)?attackTargetId:"";
 const defending=!!pending&&pending.against===side;
 const ready=!!state&&hasAccess&&canAct(state,side)&&!busy;
 const npcNeedsInitiative=Boolean(state&&state.status==="ACTIVE"&&
   state.actors.NPC.characterId===null&&hasAccess&&side==="PLAYER"&&!state.pending&&
   !canAct(state,"PLAYER")&&canAct(state,"NPC"));
 useEffect(()=>{
  if(!npcNeedsInitiative||!state||advancingNpc||busy)return;
  const key=[id,state.round,state.tick,state.actors.NPC.spentTicks,
   state.actors.PLAYER.spentTicks,state.actors.NPC.spentAp].join(":");
  if(lastNpcAdvance.current===key)return;
  lastNpcAdvance.current=key;
  let active=true;
  setAdvancingNpc(true);
  fetch("/api/combat/"+id+"/actions",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({side:"PLAYER",command:{kind:"ADVANCE"}}),
  }).then(async response=>{
   const data=await response.json();
   if(!response.ok)throw new Error(data?.error??"No se pudo avanzar la iniciativa rival.");
   if(active)setView(previous=>previous?{...previous,state:data.state}:previous);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:"No se pudo avanzar la iniciativa.");})
   .finally(()=>{if(active)setAdvancingNpc(false);});
  return ()=>{active=false;};
 },[id,npcNeedsInitiative,state?.round,state?.tick,
    state?.actors.NPC.spentTicks,state?.actors.NPC.spentAp,
    state?.actors.PLAYER.spentTicks,busy]);

 const karmaAvailable=view?.karma?.[side]??0;
 const karmaPoints=Object.values(karmaAllocation).reduce((sum,n)=>sum+(Number.isSafeInteger(n)&&n>0?n:0),0);
 const karmaCost=karmaPoints*2;
 const defenderBlocks=state?.constructions?.filter(c=>c.owner===side&&c.form==="BLOCK"&&
   (c.durability??0)>0&&Math.hypot(c.center.x-0.5,c.center.y-0.5)<=0.35)??[];
 const chosenDefenseConstruction=defenderBlocks.some(c=>c.id===defenseConstruction)?defenseConstruction:defenderBlocks[0]?.id;
 const targetDistance=actor&&state?Math.abs(actor.positionMeters-state.actors[opposingSide].positionMeters):0;
 const basicReach=attackMode==="MAGIC_AREA"?BASIC_MAGIC_RANGE_METERS:
   actor?effectiveWeaponReachMeters(actor,attackMode==="THROW",activeAttackSource):0;
 const basicOutOfRange=targetDistance>basicReach;
 const maxMove=actor?Math.max(1,Math.round(actor.race/10)):1;
 const chooseAttackMode=(mode:"MAGIC_AREA"|"MAIN_HAND"|"OFF_HAND")=>{
  setAreaCenter(null);
  if(mode==="MAGIC_AREA"){setAttackMode("MAGIC_AREA");return;}
  const source:PhysicalAttackSource=mode==="MAIN_HAND"
   ?(actor?.equippedWeapon?"MAIN_HAND":"FIST_RIGHT")
   :(actor?.offhandWeapon?"OFF_HAND":"FIST_LEFT");
  setAttackSource(source);
  const weapon=actor?weaponForSource(actor,source):undefined;
  setAttackMode(weapon?.mode==="RANGED"?"RANGED":"PHYSICAL");
 };
 const normalizedPath=physicalAnchor
   ? [physicalAnchor,...(points.length>1?points.slice(1):[physicalAnchor])]
   : points.length>1?points:defaultPath;
 function boostKarma(){
  const allocation=Object.fromEntries(Object.entries(karmaAllocation).filter(([,n])=>Number.isSafeInteger(n)&&n>0));
  const key=side+":"+JSON.stringify(allocation);
  const previous=karmaRequestRef.current;
  const requestId=previous?.key===key?previous.id:crypto.randomUUID();
  karmaRequestRef.current={key,id:requestId};
  void submit({kind:"BOOST_KARMA",requestId,allocation});
 }
 function castSkill(skill:CombatSkillPreview){
  const key=side+":"+skill.id+":"+state?.round;
  const previous=castRequestRef.current;
  const requestId=previous?.key===key?previous.id:crypto.randomUUID();
  castRequestRef.current={key,id:requestId};
  const construction=skill.skillKind==="CONSTRUCTION";
  void submit({kind:"CAST_SKILL",skillId:skill.id,requestId,
   trajectory:construction||skill.usesMagic?undefined:normalizedPath,
   attackSource:construction||skill.usesMagic?undefined:activeAttackSource,
   areaCenter:construction?constructionCenter??undefined:skill.usesMagic?areaCenter??undefined:undefined,
   constructionForm:construction?(skill.constructionMaterial==="LIGHT"?"DECOR":skill.constructionMaterial==="MIRROR"?"FIELD":constructionForm):undefined,
   constructionLabel:construction?constructionLabel.trim():undefined,
   targetConstructionId:!construction&&selectedAttackTargetId?selectedAttackTargetId:undefined});
 }
 const chronicle=state?.status==="FINISHED"
  ?(state.narrativeVersion===2&&state.narrativeText
    ?state.narrativeText:narrateCombat(state.log,state.actors)):"";
 async function copyChronicle(){
  try{
   await navigator.clipboard.writeText(chronicle);
   setNarrativeCopyStatus("Narración copiada.");
  }catch{
   setNarrativeCopyStatus("No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.");
  }
 }
 const hint=pending?.areaHint??"centro";
 const warningCells=magicHintCells(hint);
 const polyline=normalizedPath.map(p=>(p.x*100).toFixed(1)+","+(p.y*100).toFixed(1)).join(" ");
 return <main className="mx-auto max-w-5xl px-3 py-5 pb-28 text-zinc-100 sm:px-4 sm:py-7 sm:pb-28">
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
  {shareStatus&&<p role="status" className="mb-3 text-sm text-cyan-300">{shareStatus}</p>
  {actionFeedback&&<p role="status" className="mb-3 rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">{actionFeedback}</p>}}
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

   <div className="rounded-2xl border border-zinc-800 p-3">
    <p className="mb-2 text-xs uppercase tracking-[.15em] text-zinc-500">Adversario</p>
    <Fighter name={state.actors[opposingSide].name} side={opposingSide} state={state}/>
   </div>
   <CombatCharacterHud fighter={state.actors[side]} opponent={state.actors[opposingSide]}
    side={side} mana={state.mana?.[side]} flair={characterData?.flair??characterData?.character?.flair}
    open={hudOpen} onOpenChange={setHudOpen} onPanel={openPanel}
    canCreate={canCreateObjects} attackMode={attackMode} attackSource={activeAttackSource}
    onChooseAttack={chooseAttackMode} canActNow={ready} status={state.status}/>
   <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
    {view?.permissions.PLAYER&&view?.permissions.NPC&&<label className="mb-3 block text-xs text-zinc-400">Controlar personaje
     <select value={side} onChange={e=>setSide(e.target.value as Side)}
      className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
      <option value="PLAYER">{state.actors.PLAYER.name}</option>
      <option value="NPC">{state.actors.NPC.name}</option>
     </select>
    </label>}
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
     <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="group" aria-label="Opciones de defensa">
      {options.filter(opt=>pending.usesMagic
        ? ["DODGE","MAGIC_FIELD","CONSTRUCTION","ENDURE","NONE"].includes(opt.value)&&
          (opt.value!=="CONSTRUCTION"||defenderBlocks.length>0)
        : opt.value!=="MAGIC_FIELD"&&(opt.value!=="CONSTRUCTION"||defenderBlocks.length>0)).map(opt=>{
       const DefenseIcon=defenseIcons[opt.value];
       const active=selectedDefense===opt.value;
       return <button key={opt.value} type="button" aria-pressed={active} aria-label={opt.label} title={opt.label}
        disabled={opt.value==="MAGIC_FIELD"&&(state.mana?.[side]?.current??0)<1}
        onClick={()=>setDefense(opt.value)}
        className={"flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[10px] transition disabled:opacity-30 "+
          (active?"border-amber-400 bg-amber-400/15 text-amber-200":"border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-white")}>
        <DefenseIcon size={24} strokeWidth={1.7}/><span className="text-center leading-3">{opt.label}</span>
       </button>;
      })}
     </div>
     <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
      {options.find(opt=>opt.value===selectedDefense)?.description}
      {selectedDefense==="MAGIC_FIELD"&&actor?.magicFieldDescription?" · "+actor.magicFieldDescription:""}
      {selectedDefense==="MAGIC_FIELD"?" · "+fieldNames[actor?.magicFieldType??"CONCENTRATED"]:""}
     </p>
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
     {selectedDefense==="CONSTRUCTION"&&defenderBlocks.length>0&&
      <label className="block text-sm">Bloque que interceptará el golpe
       <select value={chosenDefenseConstruction} onChange={e=>setDefenseConstruction(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2">
        {defenderBlocks.map(block=><option key={block.id} value={block.id}>
          {block.label} · resistencia restante {block.durability}
          {block.passive?" · pasiva activa":""}
        </option>)}
       </select>
      </label>}
     <button onClick={()=>void submit({kind:"DEFEND",defense:selectedDefense,constructionId:selectedDefense==="CONSTRUCTION"?chosenDefenseConstruction:undefined,defenseAngle:angle,weaponSlot:dodgeDirection==="WEAPON"?activeRecoverSlot:undefined,dodgeDirection:selectedDefense==="DODGE"?dodgeDirection:undefined,
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
       className="rounded-lg border border-cyan-500 px-4 py-2 text-cyan-200 disabled:opacity-40"><Footprints size={17} className="mr-1 inline-block align-[-3px]"/> Mover</button>
      <button disabled={!ready} onClick={()=>void submit({kind:"WAIT"})}
       className="rounded-lg border border-zinc-500 px-4 py-2 disabled:opacity-40"><Undo2 size={17} className="mr-1 inline-block align-[-3px]"/> Terminar turno</button>
     </div>
     <div className="rounded-xl border border-zinc-700 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
       <b>{attackMode==="MAGIC_AREA"?(displayedAttackType==="CUT"?"Elige el centro de la línea mágica":displayedAttackType==="PIERCE"?"Elige la punta mágica":"Elige el centro de la explosión"):displayedAttackType==="PIERCE"?"Marca el punto de perforación":displayedAttackType==="BLUNT"?"Dibuja un golpe contundente rígido":"Dibuja la trayectoria del corte"}</b>
       <button onClick={()=>{setPoints(physicalAnchor?[physicalAnchor,physicalAnchor]:defaultPath);setAreaCenter(null);}} className="rounded border border-zinc-600 px-3 py-1 text-xs">Restablecer</button>
      </div>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
       {attackMode==="MAGIC_AREA"?<><WandSparkles size={16}/> Magia básica</>:
        <><Swords size={16}/> {selectedWeapon?.name??(activeAttackSource==="KICK"?"Patada":activeAttackSource==="FIST_LEFT"?"Puño izquierdo":"Puño derecho")}</>}
       <span>· Cambia de mano o magia en el panel inferior.</span>
      </p>
      {attackMode!=="MAGIC_AREA"&&<details className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
       <summary className="cursor-pointer text-xs text-zinc-400">Otras opciones: puños, patada, proyectiles y arrojar armas</summary>
       <div className="mt-2 flex flex-wrap gap-2">
        {(["FIST_RIGHT","FIST_LEFT","KICK"] as const).map(source=><button type="button" key={source}
         aria-pressed={activeAttackSource===source} onClick={()=>{setAttackSource(source);setAttackMode("PHYSICAL");setAreaCenter(null);}}
         className={"flex min-h-9 items-center gap-1 rounded-lg border px-2 text-xs "+
          (activeAttackSource===source?"border-cyan-400 text-cyan-200":"border-zinc-700 text-zinc-400")}>
         {source==="KICK"?<Footprints size={15}/>:<Hand size={15}/>} {source==="KICK"?"Patada":source==="FIST_LEFT"?"Puño izquierdo":"Puño derecho"}
        </button>)}
        {selectedWeapon?.throwable&&<button type="button" onClick={()=>{setAttackMode(attackMode==="THROW"?"PHYSICAL":"THROW");setAreaCenter(null);}}
         aria-pressed={attackMode==="THROW"} className="flex min-h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-300">
         <Send size={15}/> {attackMode==="THROW"?"Volver a cuerpo a cuerpo":"Arrojar arma"}
        </button>}
        {selectedWeapon?.mode==="RANGED"&&<button type="button" onClick={()=>{setAttackMode("RANGED");setAreaCenter(null);}}
         aria-pressed={attackMode==="RANGED"} className="flex min-h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-300">
         <Target size={15}/> Disparo a distancia
        </button>}
       </div>
      </details>
      {enemyMirrors.length>0&&<label className="mb-3 block text-sm">Objetivo del ataque
       <select value={selectedAttackTargetId} onChange={e=>setAttackTargetId(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
        <option value="">Personaje rival</option>
        {enemyMirrors.map(mirror=><option key={mirror.id} value={mirror.id}>
         {mirror.label} · resistencia {mirror.durability} · posición {Math.round(mirror.center.x*100)}%, {Math.round(mirror.center.y*100)}%
        </option>)}
       </select>
       <span className="mt-1 block text-xs text-zinc-400">Puedes atacar físicamente el espejo para romperlo. La magia que alcance su posición se reflejará según sus efectos.</span>
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
       {enemyMirrors.map(mirror=><g key={mirror.id} pointerEvents="none">
        <rect x={mirror.center.x*100-3.5} y={mirror.center.y*100-7}
         width="7" height="14" rx="1.5" stroke={selectedAttackTargetId===mirror.id?"#fbbf24":"#67e8f9"}
         fill="#164e63" strokeWidth={selectedAttackTargetId===mirror.id?1.5:0.8}/>
        <path d={`M${mirror.center.x*100-1.8},${mirror.center.y*100-5} l3.5,9`}
         stroke="#a5f3fc" strokeWidth="0.6"/>
       </g>)}
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
       {basicOutOfRange&&<p role="status" className="mb-2 text-xs text-amber-300">El objetivo está a {targetDistance.toFixed(2)} m y el alcance máximo seleccionado es {basicReach.toFixed(2)} m. Acércate antes de atacar.</p>}
       <button disabled={!ready||basicOutOfRange||(attackMode==="RANGED"&&selectedWeapon?.mode!=="RANGED")||(attackMode==="THROW"&&!selectedWeapon?.throwable)||(attackMode==="PHYSICAL"&&selectedWeapon?.mode==="RANGED")||(attackMode!=="PHYSICAL"?!areaCenter:points.length<2)||(attackMode==="MAGIC_AREA"&&(state?.mana?.[side]?.current??0)<BASIC_MAGIC_MANA_COST)}
         onClick={()=>void submit(attackMode==="MAGIC_AREA"
           ? {kind:"ATTACK",usesMagic:true,attackType:actor?.attackType??"CUT",areaCenter:areaCenter??undefined,targetConstructionId:selectedAttackTargetId||undefined}
           : attackMode==="THROW"?{kind:"ATTACK",throwWeapon:true,attackSource:activeAttackSource,attackType:displayedAttackType,areaCenter:areaCenter??undefined,targetConstructionId:selectedAttackTargetId||undefined}
           : attackMode==="RANGED"?{kind:"ATTACK",rangedPhysical:true,attackSource:activeAttackSource,attackType:displayedAttackType,areaCenter:areaCenter??undefined,targetConstructionId:selectedAttackTargetId||undefined}
           : {kind:"ATTACK",attackSource:activeAttackSource,attackType:displayedAttackType,trajectory:normalizedPath,targetConstructionId:selectedAttackTargetId||undefined})}
         className="rounded-lg bg-rose-400 px-5 py-2 font-bold text-zinc-950 disabled:opacity-40">
        {attackMode==="MAGIC_AREA"?"Lanzar magia":attackMode==="RANGED"?"Disparar proyectil":attackMode==="THROW"?"Arrojar arma":"Atacar"}
       </button>
      </div>
     </div>
    </div>}
   </section>
   {isPvp&&<p className="mt-4 text-xs text-zinc-400">PvP compartido: el dueño de cada personaje abre esta misma URL en su cuenta. Las acciones aparecen aproximadamente cada 3,5 segundos; no hay invitaciones automáticas todavía.</p>}

   <CombatDialog open={panel==="karma"} title="Mini boost de karma" onClose={closePanel}>
    {error&&<p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
     <section className="rounded-xl border border-amber-400/30 bg-zinc-950 p-3">
      <h3 className="font-semibold text-amber-200">Mini boost de karma 🪷</h3>
      <p className="mt-1 text-xs text-zinc-400">2 karma por +1 en una estadística base. Toda la distribución cuesta una sola acción (1 PA); el karma gastado no se recupera y los bonos terminan con el combate.</p>
      <p className="mt-2 text-sm">Saldo: <b>{karmaAvailable} 🪷</b> · Gasto seleccionado: <b>{karmaCost} 🪷</b> · Coste de acción: <b>1 PA</b></p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
       {(view?.boostStats??[]).map(stat=><label className="text-xs" key={stat.key}>
        {stat.label}
        <input aria-label={"Puntos de "+stat.label} type="number" min="0" step="1"
         value={karmaAllocation[stat.key]??0}
         onChange={e=>setKarmaAllocation(old=>({...old,[stat.key]:Number(e.target.value)}))}
         className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2"/>
       </label>)}
      </div>
      <button type="button" disabled={!ready||karmaPoints<=0||karmaCost>karmaAvailable||
        Object.values(karmaAllocation).some(n=>!Number.isSafeInteger(n)||n<0)}
       onClick={boostKarma} className="mt-3 rounded-lg border border-amber-400 px-4 py-2 font-semibold text-amber-200 disabled:opacity-40">
       Activar boost ({karmaCost} 🪷, 1 PA)
      </button>
      {Object.keys(state.karmaBoosts?.[side]??{}).length>0&&
       <p className="mt-2 text-xs text-amber-300">Bonos de este encuentro: {Object.entries(state.karmaBoosts?.[side]??{}).map(([stat,n])=>stat+" +"+n).join(", ")}</p>}
     </section>

   </CombatDialog>
   <CombatDialog open={panel==="construction"&&canCreateObjects&&state.status==="ACTIVE"} title="Constructor de objetos" onClose={closePanel}>
    {error&&<p role="alert" className="mb-3 rounded-lg border border-rose-700/50 p-2 text-sm text-rose-200">{error}</p>}
    {!ready&&<p role="status" className="mb-3 text-sm text-amber-300">{advancingNpc?"El adversario está actuando...":"Aún no tienes la iniciativa: puedes preparar la posición y lanzar la creación al llegar tu turno."}</p>}
   {state.status==="ACTIVE"&&(canCreateObjects||(state.constructions?.length??0)>0)&&<section className="mt-5 rounded-xl border border-cyan-400/30 bg-zinc-950 p-4">
    <h2 className="font-semibold text-cyan-200">{canCreateObjects?"Constructor de objetos":"Construcciones en el campo"}</h2>
    {canCreateObjects&&<p className="mt-1 text-xs text-zinc-400">Selecciona dónde colocar una creación y actívala desde una habilidad con efecto Crear. Sus propiedades dependen del material y de las pasivas configuradas. Los objetos decorativos no bloquean ataques.</p>}
    <svg aria-label={canCreateObjects?"Seleccionar posición de construcción":"Construcciones presentes en el campo"} viewBox="0 0 100 100"
     role={canCreateObjects?"button":"img"} tabIndex={canCreateObjects?0:undefined}
     onClick={e=>{
      if(!canCreateObjects)return;
      const rect=e.currentTarget.getBoundingClientRect();
      if(rect.width&&rect.height)setConstructionCenter({
       x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
       y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height)),
      });
     }}
     onKeyDown={e=>{if(canCreateObjects&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setConstructionCenter({x:0.5,y:0.5});}}}
     className={"mt-3 aspect-square w-full max-w-sm rounded-lg border border-zinc-600 bg-zinc-900"+(canCreateObjects?" cursor-crosshair":"")}>
      {Array.from({length:9},(_,i)=><g key={i}>
       <line x1={(i+1)*10} x2={(i+1)*10} y1="0" y2="100" stroke="#3f3f46" strokeWidth=".4"/>
       <line x1="0" x2="100" y1={(i+1)*10} y2={(i+1)*10} stroke="#3f3f46" strokeWidth=".4"/>
      </g>)}
      <circle cx="50" cy="50" r="7" stroke="#a1a1aa" fill="none" strokeDasharray="2 2"/>
      {(state.constructions??[]).map(c=><g key={c.id}>
       {c.form==="MIRROR"
        ?<g>
          <rect x={c.center.x*100-4} y={c.center.y*100-8}
           width="8" height="16" rx="1.5" fill="#164e63" stroke="#67e8f9" strokeWidth="1.2"/>
          <path d={`M${c.center.x*100-2.5},${c.center.y*100-5} l5,11`}
           stroke="#a5f3fc" strokeWidth=".8"/>
         </g>
        :c.form==="BLOCK"
        ?<rect x={c.center.x*100-7} y={c.center.y*100-7} width="14" height="14" rx="1" fill="#d6ab72" stroke="#facc15"/>
        :<circle cx={c.center.x*100} cy={c.center.y*100} r={c.form==="FIELD"?11:5}
         stroke={c.material==="LIGHT"?"#67e8f9":"#d6ab72"} strokeWidth="2"
         fill={c.material==="LIGHT"?"#67e8f9":"#d6ab72"} fillOpacity=".26"/>}
      </g>)}
      {canCreateObjects&&constructionCenter&&<circle cx={constructionCenter.x*100} cy={constructionCenter.y*100}
       r="3" fill="#fb7185" stroke="#fff" strokeWidth="1"/>}
    </svg>
    {canCreateObjects&&<div className="mt-3 flex flex-wrap gap-3">
     {canCreateMaterialBlocks&&<label className="text-sm">Forma del material
      <select value={constructionForm} onChange={e=>setConstructionForm(e.target.value as "FIELD"|"BLOCK")}
       className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
       <option value="FIELD">Campo de material</option><option value="BLOCK">Bloque defensivo</option>
      </select>
     </label>}
     <label className="text-sm">Nombre del objeto (opcional)
      <input value={constructionLabel} maxLength={60} onChange={e=>setConstructionLabel(e.target.value)}
       className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2" placeholder="Nombre opcional"/>
     </label>
    </div>}
    {canCreateObjects&&!constructionCenter&&<p className="mt-2 text-xs text-amber-300">Selecciona una posición en el terreno para crear el objeto.</p>}
    {(state.constructions??[]).length>0&&<div className="mt-3 space-y-1">
     {state.constructions?.map(c=><p key={c.id} className="text-xs text-zinc-300">
      {state.actors[c.owner].name}: {c.label} · {c.form==="MIRROR"?"espejo mágico, resistencia "+c.durability+" · rayo por turno · reflexión "+Math.round((c.mirror?.reflectionMultiplier??0)*100)+"%":c.form==="BLOCK"?"bloque defensivo, resistencia "+c.durability:c.form==="DECOR"?"decorativo, sin efectos":"campo de material"}
      {c.passive?" · pasiva de resistencia automática":""}
     </p>)}
    </div>}
   </section>}

    <div className="mt-3 grid gap-2 sm:grid-cols-2">
     {(constructionSkills[side]??[]).map(skill=>{
      const nextRound=state.skillCooldowns?.[side]?.[String(skill.id)]??0;
      const cooled=nextRound===-1||nextRound>state.round;
      const disabled=!ready||!constructionCenter||cooled||(state.mana?.[side]?.current??0)<skill.manaCost||
        (skill.constructionMaterial==="MIRROR"&&targetDistance>(skill.rangeMeters??0));
      return <button key={skill.id} type="button" disabled={disabled} onClick={()=>castSkill(skill)}
       className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-500/70 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-200 disabled:opacity-40">
       <Plus size={16}/> Crear con {skill.name} · {skill.manaCost} maná
      </button>;
     })}
    </div>
    {canCreateObjects&&!constructionCenter&&<p className="mt-2 text-xs text-amber-300">Primero indica dónde aparecerá la construcción.</p>}
    {(constructionSkills[side]??[]).some(skill=>skill.constructionMaterial==="MIRROR"&&targetDistance>(skill.rangeMeters??0))&&
     <p className="mt-2 text-xs text-amber-300">Hay creaciones fuera de alcance. Acércate al adversario para invocarlas.</p>}
    <button type="button" onClick={()=>{openPanel("skills",null);}} className="mt-3 flex items-center gap-2 rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-200">
     <Sparkles size={16}/> Ver habilidades de creación
    </button>
   </CombatDialog>
   <CombatDialog open={panel==="skills"} title="Habilidades de combate" onClose={closePanel}>
    {error&&<p role="alert" className="mb-3 rounded-lg border border-rose-700/50 p-2 text-sm text-rose-200">{error}</p>}
    {!ready&&state.status==="ACTIVE"&&<p role="status" className="mb-3 rounded-lg border border-amber-500/40 p-2 text-sm text-amber-300">
      {advancingNpc?"El adversario está tomando su iniciativa.":defending?"Tienes una reacción pendiente; resuélvela antes de lanzar una habilidad.":"La habilidad estará disponible cuando te corresponda actuar."}
    </p>}
   <CombatSkillLoadout encounterId={id} side={side} authorized={hasAccess}
    canUseSkill={ready} busy={busy} round={state.round}
    mana={state.mana?.[side]?.current??null}
    cooldowns={state.skillCooldowns?.[side]??{}}
    onCast={castSkill} aimMode={attackMode==="MAGIC_AREA"?"MAGIC_AREA":"PHYSICAL"} magicAimReady={areaCenter!==null} constructionAimReady={canCreateObjects&&constructionCenter!==null} onConstructionMaterialsChange={onConstructionMaterialsChange} onConstructionSkillsChange={onConstructionSkillsChange} categoryFilter={skillCategory} distanceMeters={targetDistance}/>

   </CombatDialog>
   <CombatDialog open={panel==="stats"} title="Estado y estadísticas" onClose={closePanel}>
    <p className="mb-3 text-xs text-zinc-400">Estadísticas y recursos del encuentro actual. Los modificadores temporales no se guardan en la ficha.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
     {([["HP",actor?.hp+"/"+actor?.maxHp],["Maná",state.mana?.[side]?.current+"/"+state.mana?.[side]?.max],["PA",actor?remainingAp(actor)+"/"+actionPoints(actor.constitution):"—"],
      ["Fuerza",actor?.strength],["Agilidad",actor?.agility],["Constitución",actor?.constitution],
      ["Ataque físico",actor?.physicalAttack],["Ataque mágico",actor?.magicAttack],
      ["Defensa física",actor?.physicalDefense],["Defensa mágica",actor?.magicDefense],
      ["Precisión",actor?.precision],["Esquive",actor?.dodge],["Crítico",actor?.critical],["Suerte",actor?.luck]]
      as Array<[string,string|number|undefined]>).map(([label,value])=>
      <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
       <p className="text-xs text-zinc-400">{label}</p><b>{value??"—"}</b>
      </div>)}
    </div>
    {Object.keys(state.karmaBoosts?.[side]??{}).length>0&&
     <p className="mt-3 text-sm text-amber-200">Boosts de combate: {Object.entries(state.karmaBoosts?.[side]??{}).map(([stat,value])=>stat+" +"+value).join(", ")}</p>}
    {actor?.characterId&&<Link href={"/characters/"+actor.characterId} className="mt-4 inline-block text-sm text-cyan-300">Ver ficha completa de estadísticas</Link>}
   </CombatDialog>
   <CombatDialog open={panel==="inventory"} title="Inventario del personaje" onClose={closePanel}>
    {characterDataError&&<p role="status" className="mb-3 text-sm text-amber-300">{characterDataError}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
     {(Array.isArray(characterData?.equipment)?characterData.equipment:[]).map((entry:any)=>
      <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
       <div className="flex items-center justify-between gap-2"><b className="text-sm">{entry.item?.name??entry.name??"Objeto"}</b>
        <span className="text-xs text-zinc-400">×{entry.quantity??1}</span></div>
       <p className="mt-1 text-xs text-zinc-500">{entry.item?.description??(entry.equipped?"Equipado":"Sin descripción")}</p>
      </div>)}
    </div>
    {!characterData&&<p className="mt-2 text-sm text-zinc-400">Consultando inventario…</p>}
    {characterData&&(!Array.isArray(characterData.equipment)||characterData.equipment.length===0)&&
     <p className="mt-2 text-sm text-zinc-400">No hay objetos en el inventario.</p>}
    <div className="mt-3 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">
     <p>Mano principal: {actor?.equippedWeapon?.name??"Libre"}</p>
     <p>Mano secundaria: {actor?.offhandWeapon?.name??"Libre"}</p>
    </div>
    <p className="mt-2 text-xs text-zinc-500">Los HP y el maná mostrados en combate no se descuentan de la ficha.</p>
    {actor?.characterId&&<Link href={"/characters/"+actor.characterId} className="mt-3 inline-block text-sm text-cyan-300">Abrir inventario completo en la ficha</Link>}
   </CombatDialog>
   {state.status==="FINISHED"&&<section className="mt-5 rounded-xl border border-amber-500/40 bg-zinc-950 p-4" aria-label="Crónica del encuentro">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
     <h2 className="text-lg font-bold text-amber-200">Crónica del encuentro</h2>
     <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>void copyChronicle()}
       className="rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-100">
       Copiar narración
      </button>
      <button type="button" onClick={()=>void load()}
       className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200">
       Actualizar resultado
      </button>
     </div>
    </div>
    <p className="mb-3 text-sm text-zinc-400">Relato del encuentro organizado por turnos, con sus acciones y consecuencias. El refresco automático ya está detenido.</p>
    {narrativeCopyStatus&&<p role="status" className="mb-3 text-sm text-amber-200">{narrativeCopyStatus}</p>}
    {state.narrativePartial&&<p className="mb-2 text-xs text-zinc-400">Encuentro anterior: este relato utiliza únicamente las acciones todavía conservadas en el registro.</p>}
    <article aria-label="Narración completa del encuentro"
     className="select-text whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm leading-7 text-zinc-100">
     {chronicle}
    </article>
   </section>}
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
