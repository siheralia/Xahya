"use client";
import {useState,type PointerEvent} from "react";
import {fieldPosition,pointToFieldView,previewPlanarMove,FIELD_VIEW_METERS} from "@/lib/combat/field-plane";
import type {CombatState,Point,Side} from "@/lib/combat/turn-engine";

export type FieldMode="MOVE"|"CONSTRUCT"|"VIEW";
type Props={
 state:CombatState;side:Side;mode:FieldMode;disabled:boolean;
 move:Point|null;onMove:(move:Point|null)=>void;
 placement:Point|null;onPlacement:(point:Point)=>void;
};
const within=(n:number)=>Math.max(0,Math.min(1,n));
function pointerPoint(e:PointerEvent<SVGSVGElement>):Point{
 const rect=e.currentTarget.getBoundingClientRect();
 return rect.width&&rect.height?{x:within((e.clientX-rect.left)/rect.width),
  y:within((e.clientY-rect.top)/rect.height)}:{x:0.5,y:0.5};
}
const inCanvas=(point:Point)=>point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1;

export default function CombatTopDownPlane({
 state,side,mode,disabled,move,onMove,placement,onPlacement
}:Props){
 const [dragging,setDragging]=useState(false);
 const actor=state.actors[side],center=fieldPosition(actor);
 const markers=Object.entries(state.actors) as Array<[Side,typeof actor]>;
 function update(e:PointerEvent<SVGSVGElement>){
  if(disabled||mode==="VIEW")return;
  const p=pointerPoint(e);
  if(mode==="CONSTRUCT")onPlacement(p);
  else onMove(previewPlanarMove(p));
 }
 function begin(e:PointerEvent<SVGSVGElement>){
  if(disabled||mode==="VIEW")return;
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* SVG capture is optional */}
  setDragging(true);update(e);
 }
 const end=()=>setDragging(false);
 return <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
  aria-label={mode==="CONSTRUCT"?"Plano horizontal: elegir ubicación de construcción":
    mode==="MOVE"?"Plano horizontal: dibujar desplazamiento de hasta un metro":"Plano horizontal del terreno"}
  onPointerDown={begin} onPointerMove={e=>{if(dragging)update(e);}}
  onPointerUp={end} onPointerCancel={end}
  onKeyDown={e=>{
   if(disabled||mode==="VIEW")return;
   if(e.key==="Escape"&&mode==="MOVE"){onMove(null);return;}
   if(e.key==="Enter"||e.key===" "){
    e.preventDefault();
    if(mode==="CONSTRUCT")onPlacement({x:0.5,y:0.5});
    else onMove({x:0.5,y:0});
   }
  }}
  role={mode==="VIEW"||disabled?"img":"button"}
  tabIndex={mode==="VIEW"||disabled?undefined:0}
  className={"aspect-square w-full rounded-xl border border-cyan-500/40 bg-zinc-950 touch-none "+
   (disabled||mode==="VIEW"?"":"cursor-crosshair")}>
  <title>Plano del terreno: vista desde arriba. Una línea equivale a un metro de desplazamiento.</title>
  {Array.from({length:11},(_,i)=><g key={i} pointerEvents="none">
   <line x1={i*10} y1="0" x2={i*10} y2="100" stroke="#334155" strokeWidth=".35"/>
   <line x1="0" y1={i*10} x2="100" y2={i*10} stroke="#334155" strokeWidth=".35"/>
  </g>)}
  {/* 1m circle around the controlled fighter; 10m battlefield viewport. */}
  <circle cx="50" cy="50" r={100/FIELD_VIEW_METERS} stroke="#22d3ee"
   strokeDasharray="1.8 1.2" strokeWidth=".8" fill="#06b6d4" fillOpacity=".055" pointerEvents="none"/>
  {(state.constructions??[]).map(c=>{
   const world=c.fieldPosition??{x:c.positionMeters??state.actors[c.owner].positionMeters,y:0};
   const point=pointToFieldView(actor,world);
   if(!inCanvas(point))return null;
   return <g key={c.id} pointerEvents="none">
    <rect x={point.x*100-3.3} y={point.y*100-3.3} width="6.6" height="6.6"
     fill={c.owner===side?"#d6ab72":"#9f7aea"} fillOpacity=".55"
     stroke={c.owner===side?"#fcd34d":"#d8b4fe"} strokeWidth="1"/>
    <title>{c.label}{c.heightMeters!==undefined?" · altura "+c.heightMeters+" m":""}</title>
   </g>;
  })}
  {markers.map(([owner,f])=>{
   const world=pointToFieldView(actor,fieldPosition(f));
   const x=within(world.x)*100,y=within(world.y)*100;
   const friendly=owner===side;
   return <g key={owner} pointerEvents="none">
    <circle cx={x} cy={y} r={friendly?4:4.6}
     fill={friendly?"#34d399":"#fb7185"} fillOpacity=".2"
     stroke={friendly?"#6ee7b7":"#fda4af"} strokeWidth="1.3"/>
    <circle cx={x} cy={y} r="1.4" fill={friendly?"#6ee7b7":"#fda4af"}/>
    <text x={within(x/100)*100} y={Math.max(8,y-6)}
     fontSize="4.2" fill={friendly?"#bbf7d0":"#fecdd3"}
     textAnchor="middle">{friendly?"Tú":f.name.slice(0,12)}</text>
    {!inCanvas(world)&&<path d={`M${x-2},${y} l2,-3 l2,3`} stroke="#fda4af" fill="none" strokeWidth=".8"/>}
   </g>;
  })}
  {mode==="MOVE"&&move&&Math.hypot(move.x,move.y)>0.001&&<g pointerEvents="none">
   <line x1="50" y1="50" x2={50+move.x*10} y2={50+move.y*10}
    stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
   <circle cx={50+move.x*10} cy={50+move.y*10} r="2" fill="#7dd3fc"/>
   <text x="50" y="64" textAnchor="middle" fill="#a5f3fc" fontSize="4.2">
    {Math.hypot(move.x,move.y).toFixed(2)} m
   </text>
  </g>}
  {mode==="CONSTRUCT"&&placement&&<g pointerEvents="none">
   <circle cx={placement.x*100} cy={placement.y*100} r="3"
    fill="#fbbf24" stroke="#fff" strokeWidth="1"/>
   <path d={`M${placement.x*100-5},${placement.y*100} h10 M${placement.x*100},${placement.y*100-5} v10`}
    stroke="#fbbf24" strokeWidth=".6"/>
  </g>}
  <text x="4" y="96" fill="#94a3b8" fontSize="4">Vista superior · 10 × 10 m</text>
 </svg>;
}
