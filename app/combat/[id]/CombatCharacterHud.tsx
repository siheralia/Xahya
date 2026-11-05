"use client";
import { useState } from "react";
import { Activity, Badge, Backpack, ChevronDown, ChevronUp, Clock3, Diamond, Droplets, Hand, Heart, Plus, Scan, Shield, Spade, Sparkles, Swords, WandSparkles, ChartNoAxesColumn } from "lucide-react";
import type {CombatFighter,Side,PhysicalAttackSource} from "@/lib/combat/turn-engine";
import {actionPoints,remainingAp,effectiveWeaponReachMeters} from "@/lib/combat/turn-engine";

export type CombatPanel="none"|"karma"|"construction"|"stats"|"inventory"|"skills";
export type HudAttackMode="PHYSICAL"|"MAGIC_AREA"|"RANGED"|"THROW";

export default function CombatCharacterHud({
 fighter,opponent,side,mana,flair,open,onOpenChange,onPanel,canCreate,attackMode,attackSource,
 onChooseAttack,canActNow,status,
}:{
 fighter:CombatFighter;opponent:CombatFighter;side:Side;
 mana?:{current:number;max:number};flair?:string|null;
 open:boolean;onOpenChange:(next:boolean)=>void;
 onPanel:(panel:CombatPanel,category?:string|null)=>void;
 canCreate:boolean;attackMode:HudAttackMode;attackSource:PhysicalAttackSource;
 onChooseAttack:(mode:"MAGIC_AREA"|"MAIN_HAND"|"OFF_HAND")=>void;
 canActNow:boolean;status:"ACTIVE"|"FINISHED";
}){
 const hp=fighter.hp+"/"+fighter.maxHp;
 const mp=mana?mana.current+"/"+mana.max:"—";
 const pa=remainingAp(fighter)+"/"+actionPoints(fighter.constitution);
 // Exactly the same 100-tick budget that combat actions and reactions spend.
 const usedTicks=Math.max(0,Math.min(100,fighter.spentTicks));
 const remainingTicks=100-usedTicks;
 const ticks=remainingTicks+"/100";
 const distance=Math.abs(fighter.positionMeters-opponent.positionMeters);
 const selectedReach=attackMode==="MAGIC_AREA"?4:effectiveWeaponReachMeters(fighter,false,attackSource);
 const common="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm transition-colors";
 const modeStyle=(active:boolean)=>common+" "+(active
   ?"border-cyan-400/70 bg-cyan-950/70 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,.12)]"
   :"border-zinc-700 bg-zinc-950/80 text-zinc-400 hover:text-white");
 const categories=[
  {value:"OFFENSIVE",title:"Ofensivas",Icon:Spade},
  {value:"SUPPORT",title:"Soporte",Icon:Heart},
  {value:"UTILITY",title:"Utilidad",Icon:Scan},
  {value:"BASIC",title:"Básicas",Icon:Diamond},
  {value:"PASSIVE",title:"Pasivas",Icon:Badge},
 ];
 return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
  <section aria-label="Panel del combatiente" className={"pointer-events-auto border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur "+
    (open?"w-full max-w-md overflow-y-auto rounded-t-2xl border-b-0 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[84dvh]":"w-fit rounded-t-xl border-b-0")}>
   <button type="button" onClick={()=>onOpenChange(!open)} aria-expanded={open}
    aria-label={open?"Ocultar panel del combatiente":"Abrir panel del combatiente"}
    className={open?"flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-400":
     "flex min-h-12 items-center gap-2 px-2 py-2 text-xs sm:gap-3 sm:px-4 sm:text-sm"}>
    {open?<><ChevronDown size={17}/> Ocultar</>:<>
     <span className="flex items-center gap-1.5"><Heart size={17} className="text-rose-400"/><b>{hp}</b></span>
     <span className="flex items-center gap-1.5"><Droplets size={17} className="text-cyan-400"/><b>{mp}</b></span>
     <span className="flex items-center gap-1"><Activity size={16} className="text-amber-300"/><b>{pa}</b></span>
     <span className="flex items-center gap-1" title={"Ticks disponibles: "+ticks} aria-label={"Ticks disponibles: "+ticks}>
      <Clock3 size={16} className={remainingTicks===0?"text-rose-400":"text-emerald-300"}/><b>{ticks}</b>
     </span>
     <ChevronUp size={16} className="text-zinc-400"/>
    </>}
   </button>
   {open&&<>
    <div className="mt-3 flex items-center gap-3">
     <div className="flex h-14 w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-500/40 bg-violet-950/30"
      aria-label="Emblema del personaje">{flair?
       <span className="inline-flex max-w-full items-center justify-center whitespace-nowrap text-base leading-none sm:text-lg" title={flair}>
        {"⟨"+flair+"⟩"}
       </span>:<Shield size={30} className="text-violet-200"/>}</div>
     <div className="min-w-0 flex-1">
      <h2 className="truncate text-lg font-semibold">{fighter.name}</h2>
      <p className="text-xs text-zinc-400">Distancia al oponente: <b>{distance.toFixed(2)} m</b></p>
      <p className="text-xs text-zinc-500">Alcance seleccionado: {selectedReach.toFixed(2)} m</p>
     </div>
     <button type="button" title="Mini boost de karma" aria-label="Abrir mini boost de karma"
      disabled={status!=="ACTIVE"} onClick={()=>onPanel("karma")}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-amber-500/50 bg-amber-950/20 text-amber-200 disabled:opacity-40">
      <span className="text-lg leading-none">🪷</span><Plus size={12} className="-mt-3"/>
     </button>
    </div>
    <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
     <div className="rounded-xl bg-zinc-950/85 px-1 py-3 text-center"><Heart size={17} className="mx-auto text-rose-400"/><p className="mt-1 text-[10px] text-zinc-500">HP</p><b className="text-xs sm:text-sm">{hp}</b></div>
     <div className="rounded-xl bg-zinc-950/85 px-1 py-3 text-center"><Droplets size={17} className="mx-auto text-cyan-400"/><p className="mt-1 text-[10px] text-zinc-500">Maná</p><b className="text-xs sm:text-sm">{mp}</b></div>
     <div className="rounded-xl bg-zinc-950/85 px-1 py-3 text-center"><Activity size={17} className="mx-auto text-amber-300"/><p className="mt-1 text-[10px] text-zinc-500">PA</p><b className="text-xs sm:text-sm">{pa}</b></div>
     <div className="rounded-xl bg-zinc-950/85 px-1 py-3 text-center" aria-label={"Ticks disponibles: "+remainingTicks+" de 100"}><Clock3 size={17} className={"mx-auto "+(remainingTicks===0?"text-rose-400":"text-emerald-300")}/><p className="mt-1 text-[10px] text-zinc-500">Ticks</p><b className="text-xs sm:text-sm">{ticks}</b></div>
    </div>
    <p className="mt-2 text-xs text-zinc-400">Ticks gastados: <b>{usedTicks}/100</b>. Las acciones y defensas consumen ticks y PA; los ticks se reinician cada turno.</p>
    <p className={"mt-2 text-xs "+(canActNow?"text-emerald-300":"text-amber-300")}>
     {status==="FINISHED"?"Encuentro finalizado":remainingTicks===0?"Sin ticks disponibles para atacar o defenderte activamente este turno.":canActNow?"Tu iniciativa: puedes actuar.":"Esperando la iniciativa o reacción del adversario."}
    </p>
    <div className="mt-3 grid grid-cols-5 gap-1.5">
     {categories.map(({value,title,Icon})=><button key={value} type="button"
       aria-label={"Abrir habilidades "+title} title={title}
       onClick={()=>onPanel("skills",value)}
       className="grid h-11 place-items-center rounded-lg border border-zinc-700 bg-zinc-950 hover:border-violet-500 hover:text-violet-200">
       <Icon size={24} strokeWidth={1.5}/>
      </button>)}
    </div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">
     <button type="button" onClick={()=>onPanel("stats")} className={common+" border-zinc-700 bg-zinc-950/80 text-zinc-300"}><ChartNoAxesColumn size={16}/> Stats</button>
     <button type="button" onClick={()=>onPanel("inventory")} className={common+" border-zinc-700 bg-zinc-950/80 text-zinc-300"}><Backpack size={16}/> Inventario</button>
     <button type="button" onClick={()=>onPanel("skills",null)} className={common+" border-zinc-700 bg-zinc-950/80 text-zinc-300"}><Sparkles size={16}/> Habilidades</button>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Origen del ataque">
     <button type="button" aria-pressed={attackMode==="MAGIC_AREA"} aria-label="Ataque mágico" title="Ataque mágico"
       onClick={()=>onChooseAttack("MAGIC_AREA")} className={modeStyle(attackMode==="MAGIC_AREA")}>
       <WandSparkles size={20}/><span className="text-xs">Magia</span></button>
     <button type="button" aria-pressed={attackMode!=="MAGIC_AREA"&&["MAIN_HAND","FIST_RIGHT","KICK"].includes(attackSource)}
       aria-label="Mano principal" title="Mano principal" onClick={()=>onChooseAttack("MAIN_HAND")}
       className={modeStyle(attackMode!=="MAGIC_AREA"&&["MAIN_HAND","FIST_RIGHT","KICK"].includes(attackSource))}>
       <Swords size={19}/><span className="text-xs">Principal</span></button>
     <button type="button" aria-pressed={attackMode!=="MAGIC_AREA"&&["OFF_HAND","FIST_LEFT"].includes(attackSource)}
       aria-label="Mano secundaria" title="Mano secundaria" onClick={()=>onChooseAttack("OFF_HAND")}
       className={modeStyle(attackMode!=="MAGIC_AREA"&&["OFF_HAND","FIST_LEFT"].includes(attackSource))}>
       <Hand size={19}/><span className="text-xs">Secundaria</span></button>
    </div>
    {canCreate&&<button type="button" onClick={()=>onPanel("construction")}
      className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/50 bg-cyan-950/20 px-3 text-sm font-semibold text-cyan-200">
      <Plus size={18}/> Constructor de objetos
    </button>}
    <p className="mt-2 text-center text-[11px] text-zinc-500">Las modalidades se excluyen mutuamente; seleccionar otra no consume PA.</p>
   </>}
  </section>
 </div>;
}
