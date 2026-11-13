"use client";
import {useState,type MouseEvent} from "react";
import {Shield,Footprints,Target,AlertTriangle,ArrowUpRight,
  ArrowDownLeft,Swords,Sparkles} from "lucide-react";
import type {CombatState,Point} from "@/lib/combat/turn-engine";
import {turnTicks} from "@/lib/combat/turn-engine";
import {offhandArmorShield} from "@/lib/items/combat-wearables";
import {battleFieldViewport,fieldPosition,fieldToViewport}
 from "@/lib/combat/field-plane";

type RunningAction={owner:"PLAYER"|"NPC";kind:string;
 startsAtTick:number;endsAtTick:number};
type Projectile={id:string;owner:string;launchTick:number;impactTick:number};
export type ReactionClock={tick:number;
 pa:Record<"PLAYER"|"NPC",{used:number;limit:number}>;
 running:RunningAction[]};
type Props={state:CombatState;clock:ReactionClock;
 ownerSide:"PLAYER"|"NPC";projectiles:Projectile[];canOrder:boolean;
 onOrder:(command:Record<string,unknown>)=>void};

const initial:Point={x:.5,y:.5};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const threatKind=(kind:string)=>{
 if(kind==="ATTACK")return "Ataque";
 if(kind==="SKILL")return "Habilidad";
 if(kind==="AUTO_PROJECTILE")return "Proyectil";
 if(kind==="AUTO_SUMMON")return "Invocación";
 if(kind==="AUTO_MIRROR")return "Espejo";
 return kind;
};
const isThreat=(kind:string)=>["ATTACK","SKILL",
 "AUTO_PROJECTILE","AUTO_SUMMON","AUTO_MIRROR"].includes(kind);

/**
 * Information shown comes exclusively from the public scheduler:
 * the NPC action category and impact deadline, never the secret
 * trajectory, aim or private declaration.
 *
 * A reaction is declared in the player's next action slot; nothing can
 * rewind already committed strikes or interrupt an occupied action.
 */
export default function CombatV2Reactions({
 state,clock,ownerSide,projectiles,canOrder,onOrder,
}:Props){
 const [prediction,setPrediction]=useState<Point>(initial);
 const [dodgeDirection,setDodgeDirection]=useState<"STAY"|"AWAY"|"TOWARD">("STAY");
 const [deflection,setDeflection]=useState(0);
 const fighter=state.actors[ownerSide];
 const opponentSide=ownerSide==="PLAYER"?"NPC":"PLAYER";
 const opponent=state.actors[opponentSide];
 const normal=turnTicks(fighter);
 const threats=clock.running.filter(x=>
   x.owner===opponentSide&&isThreat(x.kind));
 const unique=new Map<number,string[]>();
 for(const threat of threats){
   unique.set(threat.endsAtTick,[
     ...(unique.get(threat.endsAtTick)??[]),threatKind(threat.kind),
   ]);
 }
 for(const projectile of projectiles.filter(x=>x.owner===opponentSide)){
   unique.set(projectile.impactTick,[
     ...(unique.get(projectile.impactTick)??[]),"Proyectil en vuelo",
   ]);
 }
 const upcoming=[...unique.entries()].sort(([a],[b])=>a-b);
 const reactionDeadline=clock.tick+normal;
 const main=fighter.equippedWeapon;
 const off=fighter.offhandWeapon??offhandArmorShield(fighter.equippedWearables);
 const shieldSlot=off?.durability!==0&&off?.characterItemId
   ?"OFF_HAND":main?.durability!==0&&main?.characterItemId
   ?"MAIN_HAND":null;
 const pa=clock.pa[ownerSide];
 const remaining=pa.limit-pa.used;
 const viewport=battleFieldViewport(fighter,opponent);
 const own=fieldToViewport(viewport,fieldPosition(fighter));
 const foe=fieldToViewport(viewport,fieldPosition(opponent));
 const dodge=()=>{
   onOrder({kind:"PREPARE_REACTION",defense:"DODGE",
     predictedCenter:{...prediction},
     ...(dodgeDirection!=="STAY"?{dodgeDirection}:{})});
 };
 const selectPrediction=(event:MouseEvent<HTMLButtonElement>)=>{
   const bounds=event.currentTarget.getBoundingClientRect();
   if(bounds.width<=0||bounds.height<=0)return;
   setPrediction({
     x:Math.round(clamp((event.clientX-bounds.left)/bounds.width)*1000)/1000,
     y:Math.round(clamp((event.clientY-bounds.top)/bounds.height)*1000)/1000,
   });
 };
 return <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
   <h2 className="flex items-center gap-2 font-semibold">
     <Shield size={18}/> Reacciones durante el tiempo compartido
   </h2>
   <p className="text-xs text-zinc-300">
     El adversario anuncia que prepara un ataque, pero no revela
     su trayectoria exacta. Elige tu defensa antes de que se resuelva.
     Una reacción permanece activa durante {normal} ticks y cuesta 1 PA
     (2 PA al combinar esquiva y movimiento).
   </p>
   {upcoming.length?
     <div role="status" className="space-y-2 rounded-lg border border-amber-700/60 bg-amber-950/20 p-3">
       <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
         <AlertTriangle size={16}/> Ataques anunciados
       </p>
       {upcoming.map(([impact,kinds])=><p key={impact} className="text-xs text-zinc-200">
         <strong>{kinds.join(" + ")}</strong> · impacto estimado en tick {impact}.
         {" "}
         {impact<clock.tick?"El impacto ya pasó.":impact<=reactionDeadline
           ?"Tu postura preparada ahora puede cubrir ese impacto."
           :"Una postura iniciada ahora terminaría antes de ese impacto."}
       </p>)}
     </div>
     :<p className="rounded-lg border border-zinc-700 p-3 text-xs text-zinc-400">
       Sin ataques anunciados todavía. Puedes preparar una defensa preventiva.
     </p>}
   <div className="grid gap-3 sm:grid-cols-2">
     <div className="rounded-lg border border-zinc-700 p-3">
       <p className="mb-2 text-xs font-medium text-zinc-300">Posiciones reales · vista superior</p>
       <svg viewBox="0 0 200 160" className="h-40 w-full rounded-md bg-zinc-900"
         role="img" aria-label="Posiciones actuales de tu personaje y el NPC">
         {Array.from({length:5},(_,i)=><g key={i} stroke="#3f3f46" strokeWidth=".7">
           <line x1={i*50} y1="0" x2={i*50} y2="160"/>
           <line x1="0" y1={i*40} x2="200" y2={i*40}/>
         </g>)}
         <line x1={own.x*200} y1={own.y*160}
           x2={foe.x*200} y2={foe.y*160} stroke="#71717a"
           strokeWidth="1" strokeDasharray="4 4"/>
         <circle cx={own.x*200} cy={own.y*160} r="8" fill="#22d3ee"
           stroke="#fff" strokeWidth="1.5"/>
         <circle cx={foe.x*200} cy={foe.y*160} r="8" fill="#fb923c"
           stroke="#fff" strokeWidth="1.5"/>
         <text x={own.x*200} y={own.y*160-13} fontSize="10" textAnchor="middle" fill="#a5f3fc">
           Tú
         </text>
         <text x={foe.x*200} y={foe.y*160-13} fontSize="10" textAnchor="middle" fill="#fed7aa">
           NPC
         </text>
       </svg>
       <p className="mt-2 text-xs text-zinc-400">
         Moverte durante el vuelo puede hacer que un proyectil falle
         al no encontrarte en el punto de impacto.
       </p>
     </div>
     <div className="rounded-lg border border-zinc-700 p-3">
       <p className="mb-2 text-xs font-medium text-zinc-300">
         Predicción del impacto · plano de reacción
       </p>
       <button type="button" disabled={!canOrder}
         onClick={selectPrediction}
         aria-label={"Marcar posible punto de impacto. Actual: "+
           Math.round(prediction.x*100)+"% horizontal, "+
           Math.round(prediction.y*100)+"% vertical"}
         className="relative block h-40 w-full touch-manipulation overflow-hidden rounded-md border border-dashed border-cyan-600 bg-zinc-900 disabled:opacity-60">
         <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           className="pointer-events-none h-full w-full" aria-hidden="true">
           {Array.from({length:5},(_,i)=><g key={i} stroke="#3f3f46" strokeWidth=".5">
             <line x1={i*25} y1="0" x2={i*25} y2="100"/>
             <line x1="0" y1={i*25} x2="100" y2={i*25}/>
           </g>)}
           <circle cx={prediction.x*100} cy={prediction.y*100}
             r="6" fill="#0891b2" fillOpacity=".2" stroke="#22d3ee"
             strokeWidth="1.5"/>
           <line x1={prediction.x*100-8} y1={prediction.y*100}
             x2={prediction.x*100+8} y2={prediction.y*100}
             stroke="#a5f3fc" strokeWidth=".8"/>
           <line x1={prediction.x*100} y1={prediction.y*100-8}
             x2={prediction.x*100} y2={prediction.y*100+8}
             stroke="#a5f3fc" strokeWidth=".8"/>
         </svg>
       </button>
       <p className="mt-2 text-xs text-zinc-400">
         Toca el recuadro para adivinar dónde impactará un ataque de área
         o un proyectil. No es la posición en metros del mapa superior.
       </p>
     </div>
   </div>
   <div className="space-y-3 border-t border-zinc-800 pt-3">
     <div className="flex flex-wrap items-center gap-2">
       <label className="text-xs text-zinc-300" htmlFor="v2-dodge-direction">
         Después de una esquiva exitosa
       </label>
       <select id="v2-dodge-direction" value={dodgeDirection}
         disabled={!canOrder}
         onChange={e=>setDodgeDirection(e.target.value as typeof dodgeDirection)}
         className="rounded-lg border border-zinc-600 bg-zinc-900 p-2 text-sm">
         <option value="STAY">Sin desplazamiento · 1 PA</option>
         <option value="AWAY">Alejarme hasta 0,5 m · 2 PA</option>
         <option value="TOWARD">Acercarme hasta 0,5 m · 2 PA</option>
       </select>
     </div>
     <div className="flex flex-wrap gap-2">
       <button type="button"
         disabled={!canOrder||remaining<(dodgeDirection==="STAY"?1:2)}
         onClick={dodge}
         className="inline-flex items-center gap-2 rounded-lg border border-cyan-600 bg-cyan-950/35 px-3 py-2 text-sm disabled:opacity-40">
         <Footprints size={16}/> Preparar esquiva
       </button>
       {shieldSlot&&<button type="button" disabled={!canOrder||remaining<1}
         onClick={()=>onOrder({kind:"GUARD",weaponSlot:shieldSlot})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">
         <Shield size={16}/> Guardia con {shieldSlot==="OFF_HAND"?"mano secundaria":"mano principal"}
       </button>}
       <button type="button" disabled={!canOrder||remaining<1}
         onClick={()=>onOrder({kind:"PREPARE_REACTION",defense:"ENDURE"})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">
         <ArrowDownLeft size={16}/> Resistir
       </button>
       <button type="button" disabled={!canOrder||remaining<1}
         onClick={()=>onOrder({kind:"PREPARE_REACTION",defense:"REPEL"})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">
         <ArrowUpRight size={16}/> Repeler
       </button>
       <button type="button" disabled={!canOrder||remaining<1}
         onClick={()=>onOrder({kind:"PREPARE_REACTION",defense:"COUNTER"})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">
         <Swords size={16}/> Contraatacar
       </button>
       <button type="button" disabled={!canOrder||remaining<1||
         (state.mana?.[ownerSide]?.current??0)<1}
         onClick={()=>onOrder({kind:"PREPARE_REACTION",defense:"MAGIC_FIELD"})}
         className="inline-flex items-center gap-2 rounded-lg border border-violet-700 px-3 py-2 text-sm disabled:opacity-40">
         <Sparkles size={16}/> Campo mágico
       </button>
     </div>
     <div className="flex flex-wrap items-center gap-3">
       <label htmlFor="v2-deflect-angle" className="text-xs text-zinc-300">
         Desvío · ángulo {deflection}°
       </label>
       <input id="v2-deflect-angle" type="range" min="0" max="359" step="1"
         value={deflection} disabled={!canOrder}
         onChange={e=>setDeflection(Number(e.target.value))}
         className="min-w-0 flex-1 accent-cyan-400"/>
       <button type="button" disabled={!canOrder||remaining<1}
         onClick={()=>onOrder({kind:"PREPARE_REACTION",defense:"DEFLECT",
           defenseAngle:deflection})}
         className="rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">
         Preparar desvío
       </button>
     </div>
     <p className="text-xs text-zinc-400">
       Los PA se reservan al preparar la postura. La esquiva comprueba
       precisión, evasión y predicción; el movimiento opcional ocurre
       solo si tiene éxito y una sola vez por postura. Una reacción que
       termine antes del impacto no lo protege.
     </p>
   </div>
 </section>;
}
