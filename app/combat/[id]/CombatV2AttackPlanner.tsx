"use client";
import {useEffect,useRef,useState,type PointerEvent,type MouseEvent} from "react";
import {Swords,Target,WandSparkles,MoveUpRight,Undo2} from "lucide-react";
import type {CombatState,Point} from "@/lib/combat/turn-engine";
import {physicalAttackStart,turnTicks} from "@/lib/combat/turn-engine";
import {battleFieldViewport,fieldPosition,fieldToViewport,previewViewportMove}
 from "@/lib/combat/field-plane";

type Command=Record<string,unknown>;
type LabSkill={id:number;name:string;cost:number;
 category:"OFFENSE"|"SUPPORT";usesMagic:boolean;
 requiresPath:boolean;needsCenter:boolean};
type Props={state:CombatState;canOrder:boolean;skills:LabSkill[];
 paLeft:number;onOrder:(command:Command)=>void};
const bound=(v:number)=>Math.max(0,Math.min(1,v));
const fmt=(v:number)=>Math.round(v*100)/100;
const length=(p:Point)=>Math.hypot(p.x,p.y);

export default function CombatV2AttackPlanner({
 state,canOrder,paLeft,onOrder,skills,
}:Props){
 const [source,setSource]=useState<"FIST_RIGHT"|"FIST_LEFT"|"KICK"|
   "MAIN_HAND"|"OFF_HAND">("FIST_RIGHT");
 const [skillId,setSkillId]=useState("");
 const [path,setPath]=useState<Point[]>([]);
 const [aim,setAim]=useState<Point>({x:.5,y:.5});
 const [order,setOrder]=useState<"NONE"|"BEFORE"|"AFTER">("NONE");
 const [step,setStep]=useState<Point>({x:0,y:0});
 const drawing=useRef(false);
 // The geometry of a completed attack cannot be replayed after the fighters
 // move. Force a fresh trajectory for each new player opportunity.
 useEffect(()=>{
   setPath([]);
   setStep({x:0,y:0});
 },[state.tick]);
 const fighter=state.actors.PLAYER,foe=state.actors.NPC;
 const weapon=source==="MAIN_HAND"?fighter.equippedWeapon:
   source==="OFF_HAND"?fighter.offhandWeapon:undefined;
 const starts=physicalAttackStart(state,"PLAYER",source)??{x:.1,y:.5};
 const validPath=path.length>=2&&
   Math.hypot(path.at(-1)!.x-starts.x,path.at(-1)!.y-starts.y)>.04;
 const move=order!=="NONE";
 const moveReady=!move||length(step)>=.01&&length(step)<=1.000001;
 const paidAp=move?2:1;
 const canStrike=canOrder&&paLeft>=paidAp&&moveReady&&
   validPath&&weapon?.mode!=="RANGED";
 const canMagic=canOrder&&paLeft>=paidAp&&moveReady&&
   (state.mana?.PLAYER?.current??0)>=1;
 const chosenSkill=skills.find(x=>String(x.id)===skillId);
 const skillCostAp=chosenSkill?.category==="OFFENSE"?paidAp:1;
 const canSkill=canOrder&&!!chosenSkill&&paLeft>=skillCostAp&&
   (state.mana?.PLAYER?.current??0)>=(chosenSkill?.cost??Infinity)&&
   (chosenSkill?.category!=="OFFENSE"||moveReady)&&
   (!chosenSkill.requiresPath||validPath);
 const viewport=battleFieldViewport(fighter,foe);
 const own=fieldToViewport(viewport,fieldPosition(fighter));
 const enemy=fieldToViewport(viewport,fieldPosition(foe));
 const pTarget=fieldToViewport(viewport,{
   x:fieldPosition(fighter).x+step.x,
   y:fieldPosition(fighter).y+step.y,
 });
 const base=():Command=>move
   ?{planarMove:{...step},movementOrder:order}:{}; 
 const slots=[
   {value:"FIST_RIGHT" as const,label:"Puño derecho"},
   {value:"FIST_LEFT" as const,label:"Puño izquierdo"},
   {value:"KICK" as const,label:"Patada"},
   ...(fighter.equippedWeapon?[{value:"MAIN_HAND" as const,
     label:"Mano principal · "+fighter.equippedWeapon.name}]:[]),
   ...(fighter.offhandWeapon?[{value:"OFF_HAND" as const,
     label:"Mano secundaria · "+fighter.offhandWeapon.name}]:[]),
 ];
 const point=(e:PointerEvent<HTMLDivElement>):Point=>{
   const rect=e.currentTarget.getBoundingClientRect();
   return {x:fmt(bound((e.clientX-rect.left)/Math.max(1,rect.width))),
     y:fmt(bound((e.clientY-rect.top)/Math.max(1,rect.height)))};
 };
 const start=(e:PointerEvent<HTMLDivElement>)=>{
   if(!canOrder)return;
   drawing.current=true;
   const to=point(e);
   setPath([{...starts},to]);
   e.currentTarget.setPointerCapture(e.pointerId);
 };
 const extend=(e:PointerEvent<HTMLDivElement>)=>{
   if(!drawing.current||!canOrder)return;
   const to=point(e);
   setPath(prev=>{
     if(prev.length<2)return [{...starts},to];
     const last=prev.at(-1)!;
     if(Math.hypot(last.x-to.x,last.y-to.y)>.06&&prev.length<16)
       return [...prev,to];
     return [...prev.slice(0,-1),to];
   });
 };
 const finish=(e:PointerEvent<HTMLDivElement>)=>{
   if(!drawing.current)return;
   extend(e);
   drawing.current=false;
   if(e.currentTarget.hasPointerCapture(e.pointerId))
     e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const pickAim=(e:MouseEvent<HTMLButtonElement>)=>{
   const rect=e.currentTarget.getBoundingClientRect();
   setAim({x:fmt(bound((e.clientX-rect.left)/Math.max(1,rect.width))),
     y:fmt(bound((e.clientY-rect.top)/Math.max(1,rect.height)))});
 };
 const pickStep=(e:MouseEvent<HTMLButtonElement>)=>{
   const rect=e.currentTarget.getBoundingClientRect();
   const normalized={
     x:bound((e.clientX-rect.left)/Math.max(1,rect.width)),
     y:bound((e.clientY-rect.top)/Math.max(1,rect.height)),
   };
   setStep(previewViewportMove(viewport,fighter,normalized));
 };
 const firePhysical=()=>onOrder({
   kind:"ATTACK",attackType:weapon?.attackType??"BLUNT",
   attackSource:source,trajectory:path.map(p=>({...p})),...base(),
 });
 const cast=()=>onOrder({kind:"ATTACK",attackType:"BLUNT",
   usesMagic:true,areaCenter:{...aim},...base()});
 const castSkill=()=>{
   if(!chosenSkill)return;
   onOrder({kind:"CAST_SKILL",skillId:chosenSkill.id,
     ...(chosenSkill.category==="OFFENSE"?{
       attackSource:source,
       ...(chosenSkill.requiresPath?{trajectory:path.map(p=>({...p}))}:{}),
       ...(chosenSkill.needsCenter?{areaCenter:{...aim}}:{}),
       ...base(),
     }:{}),
   });
 };
 return <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
   <h2 className="flex items-center gap-2 font-semibold">
     <Swords size={18}/> Preparar ataque y trayectoria
   </h2>
   <p className="text-xs text-zinc-300">
     Dibuja el recorrido del arma o puño en el plano de impacto.
     El área de magia y los proyectiles usan la diana marcada.
     Las acciones se resuelven cuando terminan sus ticks;
     no se ejecutan al pulsar.
   </p>
   <label className="block text-sm text-zinc-300">
     Origen del ataque
     <select disabled={!canOrder} value={source}
       onChange={e=>{
         setSource(e.target.value as typeof source);
         setPath([]);
       }}
       className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2">
       {slots.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
     </select>
   </label>
   <div className="grid gap-3 sm:grid-cols-2">
     <div className="rounded-lg border border-zinc-700 p-3">
       <div className="mb-2 flex justify-between gap-2 text-xs text-zinc-300">
         <span>Plano de impacto · desliza para trazar</span>
         <button type="button" onClick={()=>setPath([])} disabled={!canOrder}
           className="inline-flex items-center gap-1 text-cyan-300 disabled:opacity-40">
           <Undo2 size={13}/> Borrar
         </button>
       </div>
       <div role="application" aria-label="Dibuja una trayectoria desde el arma hacia el punto de impacto"
         className="h-44 w-full touch-none overflow-hidden rounded-lg border border-dashed border-cyan-700 bg-zinc-900"
         onPointerDown={start} onPointerMove={extend}
         onPointerUp={finish} onPointerCancel={()=>{drawing.current=false;}}>
         <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full">
           {Array.from({length:5},(_,i)=><g key={i} stroke="#3f3f46" strokeWidth=".5">
             <line x1={i*25} y1="0" x2={i*25} y2="100"/>
             <line x1="0" y1={i*25} x2="100" y2={i*25}/>
           </g>)}
           <circle cx={starts.x*100} cy={starts.y*100} r="2.5"
             stroke="#fff" strokeWidth=".8" fill="#22d3ee"/>
           {path.length>=2&&<>
             <polyline points={path.map(p=>p.x*100+","+p.y*100).join(" ")}
               fill="none" stroke="#22d3ee" strokeWidth="2.3"
               strokeLinecap="round" strokeLinejoin="round"/>
             <circle cx={path.at(-1)!.x*100} cy={path.at(-1)!.y*100}
               r="3" stroke="#fff" fill="#06b6d4" strokeWidth=".8"/>
           </>}
         </svg>
       </div>
       <p className="mt-2 text-xs text-zinc-400">
         {validPath?"Trayectoria lista · "+path.length+" puntos":
           "Traza con el dedo desde cualquier punto del recuadro hacia el objetivo."}
         {" "}El punto inicial se fija automáticamente en tu arma.
       </p>
     </div>
     <div className="rounded-lg border border-zinc-700 p-3">
       <p className="mb-2 text-xs text-zinc-300">
         Diana mágica y de proyectil · toca para apuntar
       </p>
       <button type="button" disabled={!canOrder} onClick={pickAim}
         className="h-44 w-full overflow-hidden rounded-lg border border-dashed border-violet-700 bg-zinc-900 disabled:opacity-40"
         aria-label="Elegir centro de impacto del ataque">
         <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           className="pointer-events-none h-full w-full">
           {Array.from({length:5},(_,i)=><g key={i} stroke="#3f3f46" strokeWidth=".5">
             <line x1={i*25} y1="0" x2={i*25} y2="100"/>
             <line x1="0" y1={i*25} x2="100" y2={i*25}/>
           </g>)}
           <circle cx={aim.x*100} cy={aim.y*100} r="6"
             fill="#7c3aed" fillOpacity=".15" stroke="#c4b5fd" strokeWidth="1"/>
           <circle cx={aim.x*100} cy={aim.y*100} r="1.5" fill="#ddd6fe"/>
         </svg>
       </button>
       <p className="mt-2 text-xs text-zinc-400">
         Centro: {Math.round(aim.x*100)}% horizontal ·
         {" "}{Math.round(aim.y*100)}% vertical.
         La diana no sigue automáticamente al rival.
       </p>
     </div>
   </div>
   <div className="rounded-lg border border-zinc-700 p-3">
     <label className="block text-xs font-medium text-zinc-300">
       Combinar movimiento con ataque
       <select disabled={!canOrder} value={order}
         onChange={e=>setOrder(e.target.value as typeof order)}
         className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 p-2 text-sm">
         <option value="NONE">Sin movimiento · 1 PA</option>
         <option value="BEFORE">Moverme antes de atacar · 2 PA</option>
         <option value="AFTER">Atacar y moverme después · 2 PA</option>
       </select>
     </label>
     {move&&<>
       <p className="mb-2 mt-3 text-xs text-zinc-400">
         Elige un punto en la vista superior; el desplazamiento máximo es
         1 metro y comparte los ticks del ataque.
       </p>
       <button type="button" disabled={!canOrder} onClick={pickStep}
         className="h-36 w-full overflow-hidden rounded-md border border-dashed border-cyan-700 bg-zinc-900 disabled:opacity-40"
         aria-label="Elegir desplazamiento de máximo un metro">
         <svg viewBox="0 0 200 140" className="pointer-events-none h-full w-full">
           {Array.from({length:5},(_,i)=><g key={i} stroke="#3f3f46" strokeWidth=".6">
             <line x1={i*50} y1="0" x2={i*50} y2="140"/>
             <line x1="0" y1={i*35} x2="200" y2={i*35}/>
           </g>)}
           <line x1={own.x*200} y1={own.y*140}
             x2={pTarget.x*200} y2={pTarget.y*140}
             stroke="#22d3ee" strokeWidth="2" strokeDasharray="3 2"/>
           <circle cx={own.x*200} cy={own.y*140} r="6" fill="#22d3ee"/>
           <circle cx={enemy.x*200} cy={enemy.y*140} r="6" fill="#fb923c"/>
           <circle cx={pTarget.x*200} cy={pTarget.y*140} r="5"
             fill="#fff" stroke="#0891b2" strokeWidth="1.5"/>
         </svg>
       </button>
       <p className="mt-2 text-xs text-zinc-400">
         Desplazamiento: {fmt(step.x)} m adelante · {fmt(step.y)} m lateral.
         {moveReady?"":" Debes elegir un punto distinto a tu posición."}
       </p>
     </>}
   </div>
   <div className="flex flex-wrap gap-2">
     <button type="button" disabled={!canStrike} onClick={firePhysical}
       className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">
       <Swords size={16}/> Atacar con trazo ({paidAp} PA)
     </button>
     <button type="button" disabled={!canMagic} onClick={cast}
       className="inline-flex items-center gap-2 rounded-lg border border-violet-600 px-3 py-2 text-sm disabled:opacity-40">
       <WandSparkles size={16}/> Magia básica · 1 maná ({paidAp} PA)
     </button>
     {weapon?.mode==="RANGED"&&<button type="button"
       disabled={!canOrder||paLeft<1} onClick={()=>onOrder({
         kind:"ATTACK",attackType:weapon.attackType,
         attackSource:source,rangedPhysical:true,areaCenter:{...aim},
         projectileHeights:{launchMeters:1,impactMeters:1},
       })}
       className="inline-flex items-center gap-2 rounded-lg border border-amber-700 px-3 py-2 text-sm disabled:opacity-40">
       <Target size={16}/> Disparar (1 PA)
     </button>}
     {weapon?.throwable&&<button type="button"
       disabled={!canOrder||paLeft<1} onClick={()=>onOrder({
         kind:"ATTACK",attackType:weapon.attackType,attackSource:source,
         throwWeapon:true,areaCenter:{...aim},
         projectileHeights:{launchMeters:1,impactMeters:1},
       })}
       className="inline-flex items-center gap-2 rounded-lg border border-amber-700 px-3 py-2 text-sm disabled:opacity-40">
       <MoveUpRight size={16}/> Lanzar arma (1 PA)
     </button>}
   </div>
   <div className="space-y-3 rounded-lg border border-violet-800/50 bg-violet-950/10 p-3">
     <label className="block text-sm text-zinc-300">
       Habilidades aprobadas del personaje
       <select disabled={!canOrder||!skills.length}
         value={skillId} onChange={e=>setSkillId(e.target.value)}
         className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 p-2">
         <option value="">Selecciona una habilidad compatible</option>
         {skills.map(skill=><option key={skill.id} value={skill.id}>
           {skill.name} · {skill.cost} maná ·
           {skill.category==="OFFENSE"?" Ofensiva":" Apoyo"}
         </option>)}
       </select>
     </label>
     {chosenSkill&&<p className="text-xs text-zinc-400">
       {chosenSkill.category==="SUPPORT"
         ?"El apoyo se aplica a ti mismo; no necesita diana ni trazo."
         :chosenSkill.requiresPath
           ?"Esta habilidad usa el recorrido físico dibujado arriba."
           :"Esta habilidad usa su área aprobada o su puntería mágica."}
       {chosenSkill.category==="OFFENSE"&&move?
         " Desplazamiento combinado: 2 PA.":""}
     </p>}
     <button type="button" disabled={!canSkill} onClick={castSkill}
       className="inline-flex items-center gap-2 rounded-lg border border-violet-500 bg-violet-900/30 px-4 py-2 text-sm font-semibold disabled:opacity-40">
       <WandSparkles size={16}/> Lanzar habilidad aprobada
       {chosenSkill?" ("+skillCostAp+" PA)":""}
     </button>
     {!skills.length&&<p className="text-xs text-zinc-400">
       No hay habilidades ofensivas o de apoyo modular compatibles con el
       laboratorio. Las demás siguen disponibles en combate V1.
     </p>}
   </div>
   <p className="text-xs text-zinc-400">
     Los comandos y costes siguen verificándose en el servidor.
     Movimiento combinado exige un trazo válido de máximo 1 m,
     cuesta 2 PA y no duplica los ticks. Disparos y armas arrojadas
     se declaran sin movimiento combinado en esta etapa.
   </p>
 </section>;
}
