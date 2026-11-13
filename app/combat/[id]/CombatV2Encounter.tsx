"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Hourglass,RefreshCw,
  Target,ArrowLeft,ArrowRight,Hand,Activity} from "lucide-react";
import CombatV2Reactions from "./CombatV2Reactions";
import CombatV2AttackPlanner from "./CombatV2AttackPlanner";
import CombatV2Summons from "./CombatV2Summons";
import CombatV2Items from "./CombatV2Items";
import type {CombatState} from "@/lib/combat/turn-engine";

type Status={
 tick:number;round:number;waitingFor:("PLAYER"|"NPC")[];
 pa:Record<"PLAYER"|"NPC",{used:number;limit:number}>;
 running:Array<{owner:"PLAYER"|"NPC";kind:string;
   startsAtTick:number;endsAtTick:number}>;
};
type PublicV2={
 mode:"EXPERIMENTAL_V2";state:CombatState;pvp?:boolean;
 viewerSide?:"PLAYER"|"NPC"|"SPECTATOR";
 skills?:Array<{id:number;name:string;cost:number;
   category:"OFFENSE"|"SUPPORT"|"SUMMON"|"CONSTRUCTION"|"FUSION"|"CHARGE_BUFF";usesMagic:boolean;
   chargePool?:string;minCharges?:number;maxCharges?:number;
   requiresPath:boolean;needsCenter:boolean}>;
 timeline:Status;projectiles:Array<{id:string;owner:string;
   launchTick:number;impactTick:number}>;
 limitations:string;batches?:number;replayed?:boolean;
};
function bar(health:number,max:number){
 return Math.max(0,Math.min(100,100*health/Math.max(1,max)))+"%";
}
export default function CombatV2Encounter({id}:{id:string}){
 const [data,setData]=useState<PublicV2|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [meters,setMeters]=useState(".5");
 const [lastMessage,setLastMessage]=useState("");
 const etag=useRef<string|null>(null);
 const lastRequest=useRef<{signature:string;id:string}|null>(null);
 const load=useCallback(async()=>{
   const response=await fetch("/api/combat/"+id+"/timeline",{
     cache:"no-store",headers:etag.current?{"If-None-Match":etag.current}:{},
   });
   if(response.status===304)return;
   const json=await response.json();
   if(!response.ok)throw new Error(json.error??"No se pudo leer el combate.");
   if(json.mode!=="EXPERIMENTAL_V2")throw new Error("Encuentro incompatible.");
   etag.current=response.headers.get("ETag");
   setData(json);
 },[id]);
 useEffect(()=>{
   let active=true;
   (async()=>{
     try{await load();}catch(e){if(active)setError(e instanceof Error?e.message:"Error de conexión");}
     finally{if(active)setLoading(false);}
   })();
   return()=>{active=false;};
 },[load]);
 // Poll only PvP while visible; unchanged states return ETag 304,
 // avoiding repeated download of the full combat snapshot.
 useEffect(()=>{
   if(!data?.pvp||data.state.status!=="ACTIVE")return;
   const timer=window.setInterval(()=>{
     if(document.visibilityState==="visible"&&!busy)
       void load().catch(()=>{});
   },4000);
   return()=>window.clearInterval(timer);
 },[data?.pvp,data?.state.status,busy,load]);
 const submit=async(command:Record<string,unknown>)=>{
   if(busy||!data)return;
   setBusy(true);setError("");setLastMessage("");
   try{
     const signature=JSON.stringify(command);
     const requestId=lastRequest.current?.signature===signature
       ?lastRequest.current.id
       :"lab-"+crypto.randomUUID().replace(/-/g,"");
     lastRequest.current={signature,id:requestId};
     const response=await fetch("/api/combat/"+id+"/timeline",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({command,requestId}),
     });
     const body=await response.json();
     if(!response.ok)throw new Error(body.error??"No se pudo ejecutar la acción.");
     etag.current=null;
     lastRequest.current=null;
     // POST returns only the changing combat snapshot, while the approved
     // skill list stays server-read and is refreshed on subsequent GET.
     setData(previous=>({...body,skills:previous?.skills??[]}));
     if(body.batches===0&&command.kind==="ADVANCE")
       setLastMessage("El reloj ya necesita una nueva orden tuya.");
     else if(body.batches>0)setLastMessage("Se resolvieron "+body.batches+
       " acontecimientos de la línea temporal.");
   }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}
   finally{setBusy(false);}
 };
 if(loading)return <main className="mx-auto max-w-4xl p-6 text-zinc-200">Cargando laboratorio V2…</main>;
 if(!data)return <main className="mx-auto max-w-4xl space-y-4 p-6 text-zinc-200">
   <p className="text-rose-400">{error||"No se pudo cargar el encuentro."}</p>
   <Link className="text-cyan-300 underline" href="/combat">Regresar a combates</Link>
 </main>;
 const {state,timeline,projectiles}=data;
 const ownerSide=data.viewerSide==="NPC"?"NPC":"PLAYER";
 const opponentSide=ownerSide==="PLAYER"?"NPC":"PLAYER";
 const isSpectator=data.viewerSide==="SPECTATOR";
 const player=state.actors[ownerSide],npc=state.actors[opponentSide];
 const waiting=timeline.waitingFor.includes(ownerSide);
 const canOrder=waiting&&!isSpectator&&state.status==="ACTIVE"&&
   player.hp>0&&!busy;
 const moveMax=Math.max(1,Math.round(player.race/10));
 const distance=Math.hypot(
   (player.fieldPosition?.x??player.positionMeters)-
     (npc.fieldPosition?.x??npc.positionMeters),
   (player.fieldPosition?.y??0)-(npc.fieldPosition?.y??0));
 const top=(p:typeof player,side:"PLAYER"|"NPC")=>
  <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
    <div className="flex justify-between gap-3">
      <div><p className="font-semibold">{p.name}</p><p className="text-xs text-zinc-400">
        {isSpectator?"Combatiente":side===ownerSide?"Tu personaje":
          data.pvp?"Rival PvP":"NPC de entrenamiento"}</p></div>
      <span className="text-sm text-rose-200">{Math.max(0,p.hp)}/{p.maxHp} HP</span>
    </div>
    <div className="my-3 h-2 overflow-hidden rounded bg-zinc-700">
      <div className="h-full bg-rose-400" style={{width:bar(p.hp,p.maxHp)}}/>
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
      <span>AGI: {p.agility}</span><span>CON: {p.constitution}</span>
      <span>PA: {Math.max(0,timeline.pa[side].limit-
        timeline.pa[side].used)}/{timeline.pa[side].limit}</span>
      <span>Maná: {state.mana?.[side]?.current??0}</span>
    </div>
  </div>;
  return <main className="mx-auto max-w-5xl space-y-5 px-3 py-6 text-zinc-100 sm:px-5">
   <header className="flex flex-wrap items-start justify-between gap-3">
     <div><p className="text-xs font-medium uppercase tracking-widest text-cyan-300">
       Combate experimental V2</p>
       <h1 className="text-2xl font-bold">
         {data.pvp?"Duelo PvP V2 · Línea temporal compartida":
           "Línea temporal compartida"}
       </h1>
       <p className="mt-1 text-xs text-zinc-400">
         Laboratorio V2 · Objetos consumidos y desgaste de equipo persistentes; HP y maná aislados
       </p>
     </div>
     <div className="flex items-center gap-3">
       <Link href="/combat" className="text-sm text-cyan-300 underline">Volver</Link>
       <button type="button" disabled={busy} onClick={()=>void load().catch(e=>
         setError(e instanceof Error?e.message:"No se pudo actualizar."))}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm">
         <RefreshCw size={15}/> Actualizar
       </button>
     </div>
   </header>
   <section className="grid gap-3 sm:grid-cols-2">
     {top(player,ownerSide)}{top(npc,opponentSide)}
   </section>
   <section className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
     <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
       <p className="inline-flex items-center gap-2 font-semibold"><Activity size={17}/>
         Tick {timeline.tick} · Ronda {timeline.round}</p>
       <span className="text-sm text-zinc-300">Distancia: {distance.toFixed(2)} m</span>
     </div>
     <div className="flex flex-wrap gap-2">
       {timeline.running.map((r,i)=>
         <span key={r.owner+"-"+r.startsAtTick+"-"+i}
           className="rounded-full border border-cyan-800/70 bg-cyan-950/30 px-3 py-1 text-xs">
           {r.kind==="RESERVED"?"Orden del rival oculta":
             (r.owner===ownerSide?"Tú":"Rival")+" · "+r.kind+
               " · "+r.startsAtTick+"–"+r.endsAtTick}
         </span>)}
       {projectiles.map(p=><span key={p.id}
         className="rounded-full border border-amber-800/70 bg-amber-950/30 px-3 py-1 text-xs">
         <Target size={12} className="mr-1 inline"/>
         Proyectil {p.owner===ownerSide?"tuyo":"del rival"} · impacto t{p.impactTick}
       </span>)}
       {!timeline.running.length&&!projectiles.length&&
         <span className="text-sm text-zinc-400">Sin sucesos en curso</span>}
     </div>
     {state.status==="FINISHED"
       ?<p className="mt-3 font-semibold text-emerald-300">
         Combate terminado · {state.winner===null?"Empate":
           isSpectator?"Ganó "+state.actors[state.winner].name:
           state.winner===ownerSide?"Victoria":"Derrota"}
       </p>
       :<p className="mt-3 text-xs text-zinc-300">
         {isSpectator?"Observando las decisiones de los dos propietarios.":
           waiting?"Puedes actuar o reaccionar según los sucesos visibles.":
           data.pvp?"Tu orden está reservada; esperando al otro jugador.":
           "Tu acción sigue en curso. El NPC actúa mientras transcurre el tiempo."}
       </p>}
   </section>
   <CombatV2Reactions state={state} clock={timeline}
     ownerSide={ownerSide} projectiles={projectiles} canOrder={canOrder}
     onOrder={command=>void submit(command)}/>
   <CombatV2Summons state={state} ownerSide={ownerSide} canOrder={canOrder}
     onOrder={command=>void submit(command)}/>
   <CombatV2Items state={state} ownerSide={ownerSide} canOrder={canOrder}
     paLeft={Math.max(0,timeline.pa[ownerSide].limit-timeline.pa[ownerSide].used)}
     onOrder={command=>void submit(command)}/>
   <CombatV2AttackPlanner state={state} ownerSide={ownerSide} canOrder={canOrder}
     skills={data.skills??[]}
     paLeft={Math.max(0,timeline.pa[ownerSide].limit-timeline.pa[ownerSide].used)}
     onOrder={command=>void submit(command)}/>
   <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
     <h2 className="flex items-center gap-2 font-semibold">
       Movimiento independiente y espera
     </h2>
     <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3">
       <label className="text-sm text-zinc-300">Metros
         <input type="number" min=".1" max={moveMax} step=".1"
           value={meters} onChange={e=>setMeters(e.target.value)}
           disabled={!canOrder}
           className="mt-1 block w-24 rounded-lg border border-zinc-700 bg-zinc-900 p-2"/>
       </label>
       <button disabled={!canOrder} onClick={()=>void submit({
         kind:"MOVE",direction:"TOWARD",meters:Number(meters)})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 disabled:opacity-40">
         <ArrowRight size={16}/> Acercarme
       </button>
       <button disabled={!canOrder} onClick={()=>void submit({
         kind:"MOVE",direction:"AWAY",meters:Number(meters)})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 disabled:opacity-40">
         <ArrowLeft size={16}/> Alejarme
       </button>
       {(state.droppedWeapons??[]).some(x=>x.owner===ownerSide)&&
         <button disabled={!canOrder} onClick={()=>void submit({
           kind:"MOVE",direction:"WEAPON",meters:Number(meters)})}
           className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 disabled:opacity-40">
           <Hand size={16}/> Recuperar arma
         </button>}
     </div>
     <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
       <button disabled={!canOrder} onClick={()=>void submit({kind:"WAIT"})}
         className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 disabled:opacity-40">
         <Hourglass size={16}/> Esperar (0 PA)
       </button>
       {!data.pvp&&!waiting&&state.status==="ACTIVE"&&
         <button disabled={busy} onClick={()=>void submit({kind:"ADVANCE"})}
           className="rounded-lg bg-cyan-900 px-3 py-2 text-sm disabled:opacity-40">
           Avanzar tiempo del NPC
         </button>}
     </div>
     {error&&<p role="alert" className="text-sm text-rose-400">{error}</p>}
     {lastMessage&&<p className="text-sm text-cyan-300">{lastMessage}</p>}
   </section>
   <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
     <h2 className="mb-3 font-semibold">Crónica del encuentro</h2>
     <ol className="space-y-2 text-sm text-zinc-300">
       {state.log.slice(-15).reverse().map((entry,i)=>
         <li key={i} className="border-b border-zinc-800 pb-2">
           <span className="mr-2 text-xs text-cyan-300">t{entry.tick}</span>
           {entry.summary}
         </li>)}
       {!state.log.length&&<li>La primera acción todavía no se ha resuelto.</li>}
     </ol>
   </section>
 </main>;
}
