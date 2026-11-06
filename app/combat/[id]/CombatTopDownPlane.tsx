"use client";
import {useState,type PointerEvent} from "react";
import {ZoomIn,ZoomOut,Scan} from "lucide-react";
import {battleFieldViewport,fieldPosition,fieldToViewport,viewportToField,
 previewViewportMove,pointFromFieldView,pointToFieldView} from "@/lib/combat/field-plane";
import type {CombatState,Point,Side} from "@/lib/combat/turn-engine";
import {blockingMovement,measuredBlock} from "@/lib/combat/physical-obstacles";
import {activeChaosField,chaosRotationDegrees,distortChaosMove} from "@/lib/combat/chaos-fusion";

export type FieldMode="MOVE"|"CONSTRUCT"|"VIEW";
type Props={
 state:CombatState;side:Side;mode:FieldMode;disabled:boolean;
 move:Point|null;onMove:(move:Point|null)=>void;
 placement:Point|null;onPlacement:(point:Point)=>void;plannedFootprintRadiusMeters?:number|null;
};
const within=(n:number)=>Math.max(0,Math.min(1,n));
function pointerPoint(e:PointerEvent<SVGSVGElement>):Point{
 const rect=e.currentTarget.getBoundingClientRect();
 return rect.width&&rect.height?{x:within((e.clientX-rect.left)/rect.width),
  y:within((e.clientY-rect.top)/rect.height)}:{x:0.5,y:0.5};
}
const visible=(point:Point)=>point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1;

export default function CombatTopDownPlane({
 state,side,mode,disabled,move,onMove,placement,onPlacement,plannedFootprintRadiusMeters
}:Props){
 const [dragging,setDragging]=useState(false);
 const [zoom,setZoom]=useState(1);
 const actor=state.actors[side];
 const enemy=state.actors[side==="PLAYER"?"NPC":"PLAYER"];
 const viewpoint=battleFieldViewport(actor,enemy,zoom);
 const ownerPoint=fieldToViewport(viewpoint,fieldPosition(actor));
 const scale=100/viewpoint.spanMeters;
 const radius=scale; // 1 metre in SVG units
 const cx=ownerPoint.x*100,cy=ownerPoint.y*100;
 const start=fieldPosition(actor);
 const chaos=activeChaosField(state,side);
 const actualMove=move?distortChaosMove(state,side,move):null;
 const drawnCollision=mode==="MOVE"&&actualMove&&Math.hypot(actualMove.x,actualMove.y)>0.001
  ?blockingMovement(state.constructions,start,{x:start.x+actualMove.x,y:start.y+actualMove.y}):null;
 const markers=Object.entries(state.actors) as Array<[Side,typeof actor]>;
 function update(e:PointerEvent<SVGSVGElement>){
  if(disabled||mode==="VIEW")return;
  const p=pointerPoint(e);
  if(mode==="CONSTRUCT"){
   const world=viewportToField(viewpoint,p);
   const legacy=pointToFieldView(actor,world); // server retains legacy ±5 m coordinates
   if(visible(legacy))onPlacement(legacy);
  }else onMove(previewViewportMove(viewpoint,actor,p));
 }
 function begin(e:PointerEvent<SVGSVGElement>){
  if(disabled||mode==="VIEW")return;
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* optional on SVG */}
  setDragging(true);update(e);
 }
 const end=()=>setDragging(false);
 const constructionPoint=placement?fieldToViewport(viewpoint,pointFromFieldView(actor,placement)):null;
 return <div className="relative w-full">
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
   aria-label={mode==="CONSTRUCT"?"Plano horizontal: elegir ubicación de construcción":
     mode==="MOVE"?"Plano horizontal: dibujar desplazamiento de hasta un metro":"Plano horizontal del terreno"}
   onPointerDown={begin} onPointerMove={e=>{if(dragging)update(e);}}
   onPointerUp={end} onPointerCancel={end}
   onKeyDown={e=>{
    if(disabled||mode==="VIEW")return;
    if(e.key==="Escape"&&mode==="MOVE"){onMove(null);return;}
    if(e.key==="Enter"||e.key===" "){
     e.preventDefault();
     if(mode==="CONSTRUCT")onPlacement(pointToFieldView(actor,fieldPosition(actor)));
     else onMove({x:0.5,y:0});
    }
   }}
   role={mode==="VIEW"||disabled?"img":"button"}
   tabIndex={mode==="VIEW"||disabled?undefined:0}
   className={"aspect-square w-full rounded-xl border border-cyan-500/40 bg-zinc-950 touch-none "+
    (disabled||mode==="VIEW"?"":"cursor-crosshair")}>
   <title>Vista superior dinámica de ambos combatientes. El círculo mide un metro real independientemente del zoom.</title>
   {Array.from({length:11},(_,i)=><g key={i} pointerEvents="none">
    <line x1={i*10} y1="0" x2={i*10} y2="100" stroke="#334155" strokeWidth=".35"/>
    <line x1="0" y1={i*10} x2="100" y2={i*10} stroke="#334155" strokeWidth=".35"/>
   </g>)}
   {(state.summons??[]).filter(s=>s.chaosField&&s.integrity>0&&
     s.expiresAtRound>state.round).map(summon=>{
     const pos=fieldToViewport(viewpoint,summon.fieldPosition);
     const field=summon.chaosField!;
     return <circle key={"chaos:"+summon.id} cx={pos.x*100} cy={pos.y*100}
       r={field.radiusMeters*scale} pointerEvents="none"
       stroke={summon.owner===side?"#c084fc":"#fb7185"}
       strokeWidth=".65" strokeDasharray="1.8 1.3"
       fill={summon.owner===side?"#a855f7":"#e11d48"} fillOpacity=".09">
       <title>{summon.label+" · Campo de caos "+field.radiusMeters+
         " m · rotación "+chaosRotationDegrees(field,summon.createdRound,state.round)+"°"}</title>
     </circle>;
   })}
   <circle cx={cx} cy={cy} r={radius} stroke="#22d3ee"
    strokeDasharray="1.8 1.2" strokeWidth=".65" fill="#06b6d4" fillOpacity=".055" pointerEvents="none"/>
   <circle cx={cx} cy={cy} r={radius/2} stroke="#22d3ee"
    strokeDasharray="1 1.5" strokeWidth=".4" fill="none" pointerEvents="none"/>
   {(state.constructions??[]).map(c=>{
    const world=c.fieldPosition??{x:c.positionMeters??state.actors[c.owner].positionMeters,y:0};
    const p=fieldToViewport(viewpoint,world);
    if(!visible(p))return null;
    return <g key={c.id} pointerEvents="none">
     {measuredBlock(c)
      ?<circle cx={p.x*100} cy={p.y*100}
        r={c.footprintRadiusMeters!*scale}
        fill={c.owner===side?"#d6ab72":"#9f7aea"} fillOpacity=".35"
        stroke={c.owner===side?"#fcd34d":"#d8b4fe"} strokeWidth=".8"/>
      :<rect x={p.x*100-3.3} y={p.y*100-3.3} width="6.6" height="6.6"
        fill={c.owner===side?"#d6ab72":"#9f7aea"} fillOpacity=".55"
        stroke={c.owner===side?"#fcd34d":"#d8b4fe"} strokeWidth="1"/>}
     <title>{c.label}{c.heightMeters!==undefined?" · base "+c.heightMeters+" m":""}
      {measuredBlock(c)?" · radio "+c.footprintRadiusMeters+" m · alto "+c.solidHeightMeters+" m":""}</title>
    </g>;
   })}
   {(state.summons??[]).map(summon=>{
    const pos=fieldToViewport(viewpoint,summon.fieldPosition);
    if(!visible(pos))return null;
    const x=pos.x*100,y=pos.y*100;
    return <g key={summon.id} pointerEvents="none">
      <circle cx={x} cy={y} r="3.1"
        fill={summon.owner===side?"#34d399":"#f472b6"} fillOpacity=".20"
        stroke={summon.owner===side?"#6ee7b7":"#f9a8d4"} strokeWidth=".7"/>
      <text x={x} y={y+1.2} textAnchor="middle" fontSize="4.8">{summon.fusedFrom?.length?"🌀":"🐇"}</text>
      <text x={x} y={Math.max(5,y-4.4)} fontSize="2.7"
        textAnchor="middle" fill={summon.owner===side?"#bbf7d0":"#fbcfe8"}>
        {summon.label.slice(0,15)}
      </text>
      <title>{summon.label+" · integridad "+Math.ceil(summon.integrity)+
        " · golpes "+summon.hitCount+"/"+summon.hitLimit}</title>
    </g>;
   })}
   {markers.map(([owner,f])=>{
    const world=fieldToViewport(viewpoint,fieldPosition(f));
    const x=within(world.x)*100,y=within(world.y)*100;
    const friendly=owner===side;
    return <g key={owner} pointerEvents="none">
     <circle cx={x} cy={y} r={friendly?3.3:3.8}
      fill={friendly?"#34d399":"#fb7185"} fillOpacity=".2"
      stroke={friendly?"#6ee7b7":"#fda4af"} strokeWidth="1.2"/>
     <circle cx={x} cy={y} r="1.4" fill={friendly?"#6ee7b7":"#fda4af"}/>
     <text x={x} y={Math.max(7,y-5.5)} fontSize="3.8"
      fill={friendly?"#bbf7d0":"#fecdd3"} textAnchor="middle">
      {friendly?"Tú":f.name.slice(0,12)}
     </text>
     {!visible(world)&&<path d={`M${x-2},${y} l2,-3 l2,3`} stroke="#fda4af" fill="none" strokeWidth=".8"/>}
    </g>;
   })}
   {mode==="MOVE"&&move&&Math.hypot(move.x,move.y)>0.001&&<g pointerEvents="none">
    {chaos&&actualMove&&<g>
      <line x1={cx} y1={cy} x2={cx+actualMove.x*scale}
        y2={cy+actualMove.y*scale} stroke="#e879f9"
        strokeDasharray="2 1" strokeWidth="1.65" strokeLinecap="round"/>
      <circle cx={cx+actualMove.x*scale} cy={cy+actualMove.y*scale}
        r="1.4" fill={drawnCollision?"#fb7185":"#e879f9"}/>
      <title>Destino alterado por el campo de caos: {chaos.degrees}°</title>
    </g>}
    <line x1={cx} y1={cy} x2={cx+move.x*scale} y2={cy+move.y*scale}
     stroke={drawnCollision?"#fb7185":"#22d3ee"} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx={cx+move.x*scale} cy={cy+move.y*scale} r="1.6"
     fill={drawnCollision?"#fb7185":"#7dd3fc"}/>
    <text x={cx} y={Math.min(94,cy+radius+6)} textAnchor="middle" fill="#a5f3fc" fontSize="4.2">
     {drawnCollision?"Bloqueado: "+drawnCollision.block.label:
      chaos?Math.hypot(move.x,move.y).toFixed(2)+" m · giro "+chaos.degrees+"°":
      Math.hypot(move.x,move.y).toFixed(2)+" m"}
    </text>
   </g>}
   {mode==="CONSTRUCT"&&constructionPoint&&visible(constructionPoint)&&<g pointerEvents="none">
    {plannedFootprintRadiusMeters!==null&&plannedFootprintRadiusMeters!==undefined&&
     plannedFootprintRadiusMeters>=0.1&&plannedFootprintRadiusMeters<=3&&
     <circle cx={constructionPoint.x*100} cy={constructionPoint.y*100}
      r={plannedFootprintRadiusMeters*scale} stroke="#fbbf24"
      fill="#fbbf24" fillOpacity=".08" strokeDasharray="1.5 1" strokeWidth=".7"/>}
    <circle cx={constructionPoint.x*100} cy={constructionPoint.y*100} r="3"
     fill="#fbbf24" stroke="#fff" strokeWidth="1"/>
    <path d={`M${constructionPoint.x*100-5},${constructionPoint.y*100} h10 M${constructionPoint.x*100},${constructionPoint.y*100-5} v10`}
     stroke="#fbbf24" strokeWidth=".6"/>
   </g>}
   <text x="3" y="96" fill="#94a3b8" fontSize="3.7">Vista superior · {viewpoint.spanMeters.toFixed(1)} × {viewpoint.spanMeters.toFixed(1)} m</text>
  </svg>
  <div className="absolute bottom-2 right-2 flex gap-1" role="group" aria-label="Zoom del terreno">
   <button type="button" title="Acercar" aria-label="Acercar plano"
    onClick={()=>setZoom(v=>Math.max(.35,Math.round((v-.15)*100)/100))}
    className="flex size-7 items-center justify-center rounded-md border border-cyan-400/40 bg-zinc-950/90 text-cyan-200"><ZoomIn size={15}/></button>
   <button type="button" title="Zoom automático" aria-label="Ajustar zoom a los dos personajes"
    onClick={()=>setZoom(1)}
    className="flex size-7 items-center justify-center rounded-md border border-cyan-400/40 bg-zinc-950/90 text-cyan-200"><Scan size={15}/></button>
   <button type="button" title="Alejar" aria-label="Alejar plano"
    onClick={()=>setZoom(v=>Math.min(2,Math.round((v+.15)*100)/100))}
    className="flex size-7 items-center justify-center rounded-md border border-cyan-400/40 bg-zinc-950/90 text-cyan-200"><ZoomOut size={15}/></button>
  </div>
 </div>;
}
