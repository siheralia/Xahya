"use client";
import type {CombatState,Side} from "@/lib/combat/turn-engine";
import {
 combatEquipmentCounts,equipmentCondition,equipmentSlotName,
 explainEquipmentRecovery,recentEquipmentEvents,
} from "@/lib/combat/equipment-feedback";
import {AlertTriangle,CheckCircle2,Clock3,Hammer,Shield,History} from "lucide-react";

export default function CombatEquipmentStatus({state,side}:{
 state:CombatState;side:Side;
}){
 const fighter=state.actors[side];
 const counts=combatEquipmentCounts(state,side);
 const mana=state.mana?.[side]?.current;
 const events=recentEquipmentEvents(state,side,6);
 const weapons=[fighter.equippedWeapon,fighter.offhandWeapon].filter((v):v is NonNullable<typeof v>=>!!v);
 return <section className="space-y-4" aria-label="Equipo durante el encuentro">
  <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/15 p-3 text-sm text-cyan-100">
   <h3 className="font-semibold">Equipo de este combate · estado actual</h3>
   <p className="mt-1 text-xs text-zinc-300">
    Esta vista muestra la durabilidad del encuentro, no una copia antigua del inventario.
    Las piezas equipadas al iniciar el combate siguen siendo las mismas aunque modifiques tu ficha fuera de él.
   </p>
   <p className="mt-2 text-xs text-zinc-300">
    Bloquear desgasta el arma o escudo utilizado. Si aun así el golpe te quita HP,
    también puede desgastar otras piezas que tengan activada una regla de desgaste.
   </p>
   <p className="mt-2 text-xs text-zinc-300">
    Armaduras y accesorios: {counts.total} · Rotos: {counts.broken} · Muy desgastados (25/100 o menos): {counts.damaged}.
    {" "}HP {fighter.hp}/{fighter.maxHp} · Maná {state.mana?.[side]
     ?state.mana[side].current+"/"+state.mana[side].max:"—"}.
   </p>
  </div>
  {weapons.length>0&&<div className="space-y-2">
   <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield size={16}/> Armas en las manos</h3>
   {weapons.map((weapon,index)=>{
    const durability=weapon.durability??fighter.weaponIntegrity;
    const isBroken=durability<=0;
    return <div key={weapon.characterItemId??index} className={"rounded-xl border p-3 text-sm "+
     (isBroken?"border-rose-500/60 bg-rose-950/20":"border-zinc-700 bg-zinc-900/30")}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <b>{fighter.equippedWeapon===weapon?"Mano principal":"Mano secundaria"} · {weapon.name}</b>
      <span className={isBroken?"text-rose-300":"text-emerald-300"}>
       {Math.floor(durability)}/100 {isBroken?"· Rota":""}
      </span>
     </div>
     <p className="mt-1 text-xs text-zinc-400">
      {isBroken?"No puedes atacar ni bloquear con esta arma hasta repararla.":
       "Puede desgastarse al atacar o bloquear, según las reglas del combate."}
     </p>
     {weapon.autoRepair&&<p className="mt-1 text-xs text-cyan-200">
      <Clock3 size={12} className="mr-1 inline"/> {explainEquipmentRecovery(
       {...weapon,durability},state.round,mana)}
     </p>}
    </div>;
   })}
  </div>}
  <div className="space-y-2">
   <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield size={16}/> Armaduras y accesorios equipados</h3>
   {!counts.total&&<p className="text-sm text-zinc-400">No hay armaduras ni accesorios válidos equipados en esta instantánea de combate.</p>}
   {(fighter.equippedWearables??[]).map(item=>{
    const condition=equipmentCondition(item);
    const broken=condition==="BROKEN",worn=condition==="DAMAGED";
    return <article key={item.characterItemId}
     className={"space-y-2 rounded-xl border p-3 text-sm "+
      (broken?"border-rose-500/60 bg-rose-950/20":
       worn?"border-amber-500/60 bg-amber-950/10":"border-zinc-700 bg-zinc-900/40")}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
       {broken?<AlertTriangle size={17} className="shrink-0 text-rose-300"/>:
        worn?<AlertTriangle size={17} className="shrink-0 text-amber-300"/>:
         <CheckCircle2 size={17} className="shrink-0 text-emerald-300"/>}
       <strong className="break-words">{item.name}</strong>
      </div>
      <span className={broken?"font-semibold text-rose-300":
       worn?"text-amber-200":"text-emerald-300"}>
       {item.durability}/100 · {broken?"Rota":worn?"Muy desgastada":"En uso"}
      </span>
     </div>
     <p className="text-xs text-zinc-400">
      {equipmentSlotName(item.slot)} · {item.itemType==="ARMOR"?"Armadura":"Accesorio"}
      {item.materialName?" · "+item.materialName:""}
     </p>
     <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="meter"
       aria-label={"Durabilidad de "+item.name} aria-valuemin={0} aria-valuemax={100}
       aria-valuenow={item.durability}>
      <div className={"h-full "+(broken?"bg-rose-500":worn?"bg-amber-400":"bg-emerald-400")}
       style={{width:item.durability+"%"}}/>
     </div>
     {broken&&<p className="text-xs font-medium text-rose-200">
      Rota: no puede usarse como escudo. Sus bonificaciones compatibles se recalculan
      según las reglas de este encuentro.
     </p>}
     {item.wearOnHit?<p className="text-xs text-zinc-300">
      <b>Desgaste por daño:</b> {item.wearOnHit.wearPercent}% del HP realmente perdido
      {" "}({item.wearOnHit.channel==="ALL"?"daño físico o mágico":
       item.wearOnHit.channel==="PHYSICAL"?"solo daño físico":"solo daño mágico"}).
      Esquivar o absorber todo el daño evita este desgaste.
     </p>:<p className="text-xs text-zinc-400">
      Sin regla de desgaste por daño directo a HP. {item.slot==="OFF_HAND"&&item.itemType==="ARMOR"
       ?"Si bloqueas con esta pieza, puede desgastarse igualmente.":""}
     </p>}
     <p className={"flex items-start gap-1.5 text-xs "+(item.autoRepairDisabled?"text-amber-300":"text-cyan-200")}>
      <Hammer size={13} className="mt-0.5 shrink-0"/>
      <span>{explainEquipmentRecovery(item,state.round,mana)}</span>
     </p>
    </article>;
   })}
  </div>
  <div className="rounded-xl border border-zinc-700 p-3 text-xs text-zinc-300">
   <b>¿Cómo se recupera una pieza?</b> La autorreparación, si está configurada, se intenta
   al comenzar una ronda elegible y gasta maná. No hay un botón de reparación manual
   en este panel. Al restaurarse la capacidad máxima de HP o maná, las reservas
   actuales no se rellenan gratuitamente.
  </div>
  <div className="space-y-2" aria-label="Cambios recientes de equipo">
   <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={16}/> Cambios recientes en este combate</h3>
   {events.length===0?<p className="text-xs text-zinc-400">Todavía no se registraron roturas, reparaciones ni desgaste.</p>:
    <ol className="space-y-1 text-xs">
     {events.map((event,index)=><li key={event.tick+"-"+event.type+"-"+index}
      className={"rounded-md border px-2 py-2 "+
       (event.type==="BREAK"||event.type==="ERROR"?"border-rose-800/60 text-rose-200":
        event.type==="REPAIR"?"border-emerald-800/60 text-emerald-200":
        "border-zinc-800 text-zinc-300")}>
      <span className="text-zinc-500">Tick {event.tick} · </span>{event.text}
     </li>)}
    </ol>}
  </div>
 </section>;
}
