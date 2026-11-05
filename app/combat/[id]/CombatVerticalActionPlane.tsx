"use client";
import {useState,type PointerEvent} from "react";
import type {DefenseChoice,Point} from "@/lib/combat/turn-engine";

type Props={
 mode:"REACTION"|"CONSTRUCTION";
 defense?:DefenseChoice;angle:number;onAngle:(n:number)=>void;
 height:number;onHeight:(n:number)=>void;
};
function point(e:PointerEvent<SVGSVGElement>):Point{
 const r=e.currentTarget.getBoundingClientRect();
 if(!r.width||!r.height)return {x:.5,y:.5};
 return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),
  y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
}
export default function CombatVerticalActionPlane({mode,defense,angle,onAngle,height,onHeight}:Props){
 const [dragging,setDragging]=useState(false);
 function update(e:PointerEvent<SVGSVGElement>){
  const p=point(e);
  if(mode==="CONSTRUCTION")onHeight(Math.round((1-p.y)*100)/10);
  else if(defense==="DEFLECT")
   onAngle(Math.round((Math.atan2(p.y-.5,p.x-.5)*180/Math.PI+360)%360));
 }
 return <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
  aria-label={mode==="CONSTRUCTION"?"Plano vertical para seleccionar altura":
   "Plano vertical para dibujar el desvío o visualizar la defensa"}
  role="button" tabIndex={0}
  onPointerDown={e=>{setDragging(true);try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}update(e);}}
  onPointerMove={e=>{if(dragging)update(e);}}
  onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)}
  onKeyDown={e=>{
   if(e.key==="Enter"||e.key===" "){e.preventDefault();
    if(mode==="CONSTRUCTION")onHeight(5);else if(defense==="DEFLECT")onAngle((angle+45)%360);
   }
  }}
  className="aspect-square w-full cursor-crosshair touch-none rounded-xl border border-amber-500/40 bg-zinc-900">
  {Array.from({length:11},(_,i)=><g key={i}>
   <line x1={i*10} y1="0" x2={i*10} y2="100" stroke="#3f3f46" strokeWidth=".35"/>
   <line x1="0" y1={i*10} x2="100" y2={i*10} stroke="#3f3f46" strokeWidth=".35"/>
  </g>)}
  {mode==="CONSTRUCTION"?<g>
   <line x1="50" y1="0" x2="50" y2="100" stroke="#a1a1aa" strokeDasharray="2 2" strokeWidth=".65"/>
   <line x1="35" y1={100-height*10} x2="65" y2={100-height*10} stroke="#67e8f9" strokeWidth="2.5"/>
   <rect x="43" y={100-height*10-4} width="14" height="8" fill="#a5f3fc" fillOpacity=".16" stroke="#67e8f9"/>
   <text x="50" y={Math.max(8,100-height*10-7)} textAnchor="middle" fill="#a5f3fc" fontSize="5">
    Altura {height.toFixed(1)} m
   </text>
   <text x="5" y="96" fill="#94a3b8" fontSize="4">Suelo 0 m · Arriba 10 m</text>
  </g>:<g>
   <circle cx="50" cy="50" r="9" stroke="#fb7185" fill="#fb7185" fillOpacity=".1" strokeDasharray="2 2"/>
   <circle cx="50" cy="50" r="1.8" fill="#fb7185"/>
   {defense==="DEFLECT"?<g pointerEvents="none">
    <line x1="50" y1="50" x2={50+35*Math.cos(angle*Math.PI/180)}
     y2={50+35*Math.sin(angle*Math.PI/180)}
     stroke="#67e8f9" strokeWidth="2" strokeLinecap="round"/>
    <text x="50" y="85" textAnchor="middle" fill="#bae6fd" fontSize="5">{angle}° · Desvío</text>
   </g>:<g pointerEvents="none">
    <rect x="39" y="37" width="22" height="26" rx="5" fill="#fbbf24"
     fillOpacity=".14" stroke="#fbbf24" strokeWidth="1.5"/>
    <text x="50" y="76" textAnchor="middle" fill="#fde68a" fontSize="5">
     {defense==="BLOCK"?"Bloqueo":defense==="DODGE"?"Esquiva":"Reacción"}
    </text>
   </g>}
  </g>}
 </svg>;
}
