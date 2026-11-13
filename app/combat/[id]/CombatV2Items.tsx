"use client";
import {FlaskConical} from "lucide-react";
import type {CombatState} from "@/lib/combat/turn-engine.ts";

type Props={state:CombatState;canOrder:boolean;paLeft:number;
 onOrder:(command:Record<string,unknown>)=>void};
export default function CombatV2Items({state,canOrder,paLeft,onOrder}:Props){
 const items=(state.consumables?.PLAYER??[]).filter(x=>
   x.quantity>0&&x.characterItemId!==undefined);
 if(!items.length)return null;
 return <section className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
   <h2 className="flex items-center gap-2 font-semibold">
     <FlaskConical size={18}/> Objetos · inventario real
   </h2>
   <p className="text-xs text-zinc-300">
     Utilizar un objeto requiere 1 PA; se consume solo cuando termina
     la acción. Su cantidad real se guarda con el mismo tick del combate.
     Reenviar la misma orden no gasta otra unidad.
   </p>
   <div className="grid gap-2 sm:grid-cols-2">
     {items.map(item=>{
       const full=item.action==="HEAL_HP"
         ?state.actors.PLAYER.hp>=state.actors.PLAYER.maxHp
         :(state.mana?.PLAYER?.current??0)>=(state.mana?.PLAYER?.max??0);
       const benefit=item.action==="HEAL_HP"?"Recupera "+item.amount+" HP":
         "Recupera "+item.amount+" maná";
       return <div key={item.characterItemId}
         className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 p-3">
         <div className="min-w-0">
           <p className="truncate text-sm font-semibold">{item.name}</p>
           <p className="text-xs text-zinc-400">
             {benefit} · Quedan {item.quantity}
           </p>
         </div>
         <button type="button"
           disabled={!canOrder||paLeft<1||full}
           onClick={()=>onOrder({kind:"USE_ITEM",itemId:item.itemId,
             characterItemId:item.characterItemId})}
           className="shrink-0 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40">
           Usar
         </button>
       </div>;
     })}
   </div>
 </section>;
}
