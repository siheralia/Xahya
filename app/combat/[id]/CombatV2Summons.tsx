"use client";
import {Rabbit,Target,ArrowRight,ArrowLeft} from "lucide-react";
import type {CombatState} from "@/lib/combat/turn-engine.ts";
import {fieldPosition} from "@/lib/combat/field-plane.ts";

type Props={state:CombatState;canOrder:boolean;
 onOrder:(command:Record<string,unknown>)=>void};
const meters=(n:number)=>Math.round(n*100)/100;
export default function CombatV2Summons({state,canOrder,onOrder}:Props){
 const summons=(state.summons??[]).filter(s=>
   s.owner==="PLAYER"&&s.integrity>0);
 const opponent=fieldPosition(state.actors.NPC);
 const opponentLabel=state.actors.NPC.name;
 const getMove=(creature:typeof summons[number],toward:boolean)=>{
   const dx=opponent.x-creature.fieldPosition.x;
   const dy=opponent.y-creature.fieldPosition.y;
   const size=Math.hypot(dx,dy);
   if(size<.01)return null;
   const factor=Math.min(.98,Math.max(.01,size))*(toward?1:-1)/size;
   return {x:meters(dx*factor),y:meters(dy*factor)};
 };
 if(!summons.length)return null;
 return <section className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
   <h2 className="flex items-center gap-2 font-semibold">
     <Rabbit size={17}/> Familiares activos · órdenes temporales
   </h2>
   <p className="text-xs text-zinc-300">
     Tus invocaciones pueden actuar solas según su conducta.
     Una orden cambia su comportamiento, objetivo o posición
     utilizando 1 PA del personaje, sin consumir un PA por
     cada ataque automático posterior.
   </p>
   <div className="grid gap-3 md:grid-cols-2">
     {summons.map(creature=>{
       const modes=[...new Set(["FOLLOW",...creature.behavior.allowedModes])]
         .filter(x=>["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"].includes(x));
       const toward=getMove(creature,true);
       const away=getMove(creature,false);
       return <div key={creature.id} className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
         <div className="flex items-center justify-between gap-2">
           <strong className="text-sm">{creature.label}</strong>
           <span className="text-xs text-zinc-400">
             Integridad: {Math.round(creature.integrity)}
           </span>
         </div>
         <p className="text-xs text-zinc-400">
           Conducta: {creature.behavior.mode} ·
           Próxima acción t{creature.autoNextTick??"—"}
         </p>
         <div className="flex flex-wrap gap-2">
           {modes.map(mode=><button type="button" key={mode}
             disabled={!canOrder||mode===creature.behavior.mode}
             onClick={()=>onOrder({kind:"COMMAND_SUMMON",summonId:creature.id,
               order:"CHANGE_BEHAVIOR",newBehavior:mode})}
             className="rounded-md border border-zinc-600 px-2 py-1 text-xs disabled:opacity-35">
             {mode==="FOLLOW"?"Seguir":
              mode==="ATTACK"?"Atacar":
              mode==="PROTECT"?"Proteger":
              mode==="HOLD"?"Permanecer":"Manual"}
           </button>)}
         </div>
         {creature.behavior.target==="OPPONENT"&&
           <button type="button" disabled={!canOrder}
             onClick={()=>onOrder({kind:"COMMAND_SUMMON",summonId:creature.id,
               order:"CHANGE_TARGET",targetId:"FIGHTER:NPC"})}
             className="inline-flex items-center gap-2 rounded-md border border-amber-700 px-2 py-1 text-xs disabled:opacity-35">
             <Target size={13}/> Enfocar a {opponentLabel}
           </button>}
         {creature.behavior.allowedModes.includes("MANUAL")&&
           <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-2">
             {toward&&<button type="button" disabled={!canOrder}
               onClick={()=>onOrder({kind:"COMMAND_SUMMON",summonId:creature.id,
                 order:"MOVE",planarMove:toward})}
               className="inline-flex items-center gap-1 rounded-md border border-zinc-600 px-2 py-1 text-xs disabled:opacity-35">
               <ArrowRight size={13}/> Acercar 1 m
             </button>}
             {away&&<button type="button" disabled={!canOrder}
               onClick={()=>onOrder({kind:"COMMAND_SUMMON",summonId:creature.id,
                 order:"MOVE",planarMove:away})}
               className="inline-flex items-center gap-1 rounded-md border border-zinc-600 px-2 py-1 text-xs disabled:opacity-35">
               <ArrowLeft size={13}/> Alejar 1 m
             </button>}
           </div>}
       </div>;
     })}
   </div>
 </section>;
}
