"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";

type Side="PLAYER"|"NPC";
type Point={x:number;y:number};
type Fighter={
 name:string;hp:number;maxHp:number;positionMeters:number;
 fieldPosition?:Point;attackType:"CUT"|"BLUNT"|"PIERCE";
 equippedWeapon?:{name:string;durability?:number};
 offhandWeapon?:{name:string;durability?:number};
 equippedWearables?:Array<{name:string;slot?:string;durability?:number}>;
};
type Consumable={name:string;itemId:number;characterItemId?:number;
 action:"HEAL_HP"|"RESTORE_MANA";amount:number;quantity:number};
type Summon={id:string;label:string;owner:Side;integrity:number;
 behavior:{mode:string};fieldPosition:Point};
type Fight={
 status:"ACTIVE"|"FINISHED";round:number;tick:number;winner?:Side|null;
 actors:Record<Side,Fighter>;
 mana?:Record<Side,{current:number;max:number}>;
 consumables?:Partial<Record<Side,Consumable[]>>;
 summons?:Summon[];
 constructions?:Array<{id:string;label:string;form:string;fieldPosition?:Point}>;
 log:Array<{kind:string;tick:number;by:Side;summary:string}>;
};
type Status={
 tick:number;round:number;waitingFor:Side[];
 running:Array<{owner:Side;kind:string;startsAtTick:number;endsAtTick:number}>;
};
type ResponseData={
 state:Fight;timeline:Status;permissions:Record<Side,boolean>;
};
const endpoint=(id:string)=>"/api/combat/"+encodeURIComponent(id)+"/timeline";
const point=(f:Fighter):Point=>f.fieldPosition??{x:f.positionMeters,y:0};
const clamp=(v:number,low:number,high:number)=>Math.min(high,Math.max(low,v));
const number=(value:string,defaultValue=0)=>Number.isFinite(Number(value))?
 Number(value):defaultValue;

export default function TimelineEncounter({id}:{id:string}){
 const [data,setData]=useState<ResponseData|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [side,setSide]=useState<Side>("PLAYER");
 const [moveX,setMoveX]=useState("0.5");
 const [moveY,setMoveY]=useState("0");
 const [order,setOrder]=useState<"BEFORE"|"AFTER">("BEFORE");
 const [composite,setComposite]=useState(false);
 const [attackMode,setAttackMode]=useState<"PHYSICAL"|"MAGIC">("PHYSICAL");
 const [attackSource,setAttackSource]=useState("FIST_RIGHT");
 const [attackType,setAttackType]=useState<"CUT"|"BLUNT"|"PIERCE">("BLUNT");
 const [startX,setStartX]=useState("0.1");
 const [startY,setStartY]=useState("0.5");
 const [endX,setEndX]=useState("0.5");
 const [endY,setEndY]=useState("0.5");
 const [magicX,setMagicX]=useState("0.5");
 const [magicY,setMagicY]=useState("0.5");
 const [skillId,setSkillId]=useState("");
 const [skillKind,setSkillKind]=useState("OFFENSE");
 const [itemCopy,setItemCopy]=useState("");
 const [summonId,setSummonId]=useState("");
 const [summonMode,setSummonMode]=useState("FOLLOW");
 const [guardSlot,setGuardSlot]=useState<"MAIN_HAND"|"OFF_HAND">("OFF_HAND");
 const etag=useRef<string|null>(null);
 const pending=useRef<{side:Side;command:Record<string,unknown>}|null>(null);
 const mounted=useRef(true);
 const base=endpoint(id);
 const refresh=useCallback(async()=>{
   const headers:HeadersInit=etag.current?{"If-None-Match":etag.current}:{};
   const response=await fetch(base,{cache:"no-store",headers});
   if(response.status===304)return;
   const payload=await response.json();
   if(!response.ok)throw new Error(payload.error??"No se pudo consultar V2.");
   etag.current=response.headers.get("etag");
   if(mounted.current){
     setData(payload as ResponseData);
     setSide(old=>(payload.permissions?.[old]?old:
       payload.permissions?.PLAYER?"PLAYER":"NPC"));
     setError("");
   }
 },[base]);
 useEffect(()=>{
   mounted.current=true;
   void refresh().catch(e=>setError(e instanceof Error?e.message:String(e)))
     .finally(()=>setLoading(false));
   const poll=setInterval(()=>{
     if(!pending.current&&!document.hidden)
       void refresh().catch(()=>{});
   },6000);
   return()=>{mounted.current=false;clearInterval(poll);};
 },[refresh]);
 const submit=async(payload:{side:Side;command:Record<string,unknown>})=>{
   setBusy(true);setError("");
   try{
     const response=await fetch(base,{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify(payload),
     });
     const result=await response.json();
     if(!response.ok){
       pending.current=null;throw new Error(result.error??"Acción V2 rechazada.");
     }
     pending.current=null;etag.current=null;
     setData(result as ResponseData);
   }catch(e){
     setError(e instanceof Error?e.message:"Error de conexión.");
   }finally{setBusy(false);}
 };
 const send=(command:Record<string,unknown>)=>{
   if(busy||!data||data.state.status!=="ACTIVE"||
     !data.permissions[side]||pending.current)return;
   const payload={side,command:{...command,
     requestId:crypto.randomUUID().replaceAll("-","")}};
   pending.current=payload;
   void submit(payload);
 };
 const pos=point(data?.state.actors[side]??{
   name:"",hp:0,maxHp:1,positionMeters:0,attackType:"BLUNT",
 });
 const movement=():Point=>({x:number(moveX),y:number(moveY)});
 const validMove=()=>{
   const p=movement(),d=Math.hypot(p.x,p.y);
   return d>=.01&&d<=1.00000001;
 };
 const trajectory=()=>[{x:clamp(number(startX),0,1),y:clamp(number(startY),0,1)},
   {x:clamp(number(endX),0,1),y:clamp(number(endY),0,1)}];
 const center=()=>({x:clamp(number(magicX),0,1),y:clamp(number(magicY),0,1)});
 const attackArgs=()=>{
   const base:Record<string,unknown>={
     attackType:attackMode==="MAGIC"?(data?.state.actors[side].attackType??"BLUNT"):attackType,
     ...(attackMode==="MAGIC"
       ?{usesMagic:true,areaCenter:center()}
       :{trajectory:trajectory(),attackSource})};
   if(composite&&validMove()){
     base.planarMove=movement();base.movementOrder=order;
   }
   return base;
 };
 const player=data?.state.actors[side];
 const mine=Boolean(data?.permissions[side]);
 const canSend=mine&&data?.state.status==="ACTIVE"&&!busy&&!pending.current;
 const options=data?.state.consumables?.[side]?.filter(c=>c.quantity>0)??[];
 const creatures=data?.state.summons?.filter(s=>s.owner===side)??[];
 const coords=data?([point(data.state.actors.PLAYER),point(data.state.actors.NPC)]):[];
 const span=coords.length===2?
   Math.max(2.6,Math.abs(coords[1].x-coords[0].x)+2,
     Math.abs(coords[1].y-coords[0].y)+2):3;
 const mid=coords.length===2?
   {x:(coords[0].x+coords[1].x)/2,y:(coords[0].y+coords[1].y)/2}:{x:0,y:0};
 const ux=(p:Point)=>clamp(50+(p.x-mid.x)/span*100,3,97);
 const uy=(p:Point)=>clamp(50+(p.y-mid.y)/span*100,3,97);
 const inputClass="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100";
 const btn="rounded-lg border border-cyan-700/70 bg-cyan-950/40 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-35";
 return <main className="mx-auto max-w-6xl space-y-5 px-3 py-6 text-zinc-100 sm:px-6">
   <header className="flex flex-wrap items-center justify-between gap-3">
     <div><h1 className="text-2xl font-bold">Combate continuo V2 · Piloto</h1>
       <p className="text-sm text-zinc-400">Ticks absolutos, declaraciones independientes y resolución simultánea.</p>
     </div>
     <div className="flex gap-3 text-sm">
       <Link className="text-cyan-300" href="/combat">Combates</Link>
       <Link className="text-cyan-300" href="/">Inicio</Link>
     </div>
   </header>
   {loading&&<p>Cargando encuentro…</p>}
   {error&&<div role="alert" className="rounded-xl border border-rose-600/60 bg-rose-950/40 p-3 text-sm text-rose-200">
     {error}{pending.current&&<button className="ml-3 underline" disabled={busy}
       onClick={()=>{if(pending.current)void submit(pending.current);}}>Reintentar misma solicitud</button>}
   </div>}
   {data&&<>
     <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
       {(["PLAYER","NPC"] as const).map(key=><div key={key}
         className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
         <div className="text-xs uppercase tracking-wide text-zinc-400">{key==="PLAYER"?"Combatiente A":"Combatiente B"}</div>
         <strong>{data.state.actors[key].name}</strong>
         <div className="mt-2 text-sm">HP {Math.max(0,Math.ceil(data.state.actors[key].hp))} / {Math.ceil(data.state.actors[key].maxHp)}</div>
         <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-950">
           <div className="h-full bg-rose-400" style={{width:
             clamp(100*data.state.actors[key].hp/Math.max(1,data.state.actors[key].maxHp),0,100)+"%"}}/>
         </div>
         <div className="mt-2 text-sm">Maná {data.state.mana?.[key]?.current??0} / {data.state.mana?.[key]?.max??0}</div>
       </div>)}
       <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
         <div className="text-xs uppercase tracking-wide text-zinc-400">Reloj común</div>
         <div className="text-2xl font-bold">{data.timeline.tick} <span className="text-sm font-normal">ticks</span></div>
         <p className="text-sm text-zinc-400">Ronda {data.timeline.round}</p>
       </div>
       <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
         <div className="text-xs uppercase tracking-wide text-zinc-400">Declaraciones</div>
         <p className="text-sm">Faltan: {data.timeline.waitingFor.length?
           data.timeline.waitingFor.map(s=>s==="PLAYER"?"A":"B").join(", "):"Ninguna"}</p>
         <p className="mt-1 text-xs text-zinc-400">En curso: {data.timeline.running.map(e=>
           (e.owner==="PLAYER"?"A":"B")+" · "+e.kind+" → tick "+e.endsAtTick).join(" / ")||"Sin acciones pendientes"}</p>
       </div>
     </div>
     {data.state.status==="FINISHED"&&<div className="rounded-xl border border-amber-600/50 p-3">
       Encuentro finalizado. {data.state.winner?
         "Victoria: "+data.state.actors[data.state.winner].name:"Empate"}
     </div>}
     <div className="grid gap-4 lg:grid-cols-2">
       <section className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
         <h2 className="mb-2 font-semibold">Plano horizontal</h2>
         <div className="relative h-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
           <div className="pointer-events-none absolute inset-0 opacity-20"
             style={{backgroundImage:"linear-gradient(to right,#a1a1aa 1px,transparent 1px),linear-gradient(to bottom,#a1a1aa 1px,transparent 1px)",backgroundSize:"10% 10%"}}/>
           {(["PLAYER","NPC"] as const).map(key=><div key={key}
             className={"absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-bold "+(key==="PLAYER"?
               "border-cyan-300 bg-cyan-900":"border-rose-300 bg-rose-900")}
             style={{left:ux(point(data.state.actors[key]))+"%",top:uy(point(data.state.actors[key]))+"%"}}
             title={data.state.actors[key].name}>{key==="PLAYER"?"A":"B"}</div>)}
           {(data.state.summons??[]).map(creature=><div key={creature.id}
             className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-xl"
             style={{left:ux(creature.fieldPosition)+"%",top:uy(creature.fieldPosition)+"%"}}
             title={creature.label}>🐇</div>)}
           {(data.state.constructions??[]).filter(x=>x.fieldPosition).map(item=>
             <div key={item.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-xl"
               style={{left:ux(item.fieldPosition!)+"%",top:uy(item.fieldPosition!)+"%"}}
               title={item.label}>◆</div>)}
         </div>
         <p className="mt-2 text-xs text-zinc-400">Las posiciones muestran metros reales en planta. A y B son los personajes; las invocaciones y objetos aparecen al terminar sus acciones.</p>
         <div className="mt-4">
           <label className="block text-sm">Actuar como
             <select className={inputClass+" mt-1"} value={side} disabled={busy}
               onChange={e=>setSide(e.target.value as Side)}>
               {data.permissions.PLAYER&&<option value="PLAYER">A · {data.state.actors.PLAYER.name}</option>}
               {data.permissions.NPC&&<option value="NPC">B · {data.state.actors.NPC.name}</option>}
             </select>
           </label>
           <p className="mt-2 text-xs text-zinc-400">Ubicación: ({pos.x.toFixed(2)}, {pos.y.toFixed(2)}) m</p>
         </div>
       </section>
       <section className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
         <h2 className="mb-3 font-semibold">Declarar acción</h2>
         <div className="flex flex-wrap gap-2">
           <button className={btn} disabled={!canSend} onClick={()=>send({kind:"WAIT"})}>Esperar hasta la siguiente ronda</button>
           <button className={btn} disabled={!canSend||!player?.offhandWeapon}
             onClick={()=>send({kind:"GUARD",weaponSlot:"OFF_HAND"})}>Mantener escudo secundario</button>
           <button className={btn} disabled={!canSend||!player?.equippedWeapon}
             onClick={()=>send({kind:"GUARD",weaponSlot:"MAIN_HAND"})}>Guardia con arma</button>
         </div>
         <h3 className="mt-5 mb-2 text-sm font-semibold">Ataque básico</h3>
         <div className="grid grid-cols-2 gap-2">
           <label className="text-xs">Modo<select className={inputClass} value={attackMode}
             onChange={e=>setAttackMode(e.target.value as "MAGIC"|"PHYSICAL")}>
             <option value="PHYSICAL">Físico</option><option value="MAGIC">Mágico (1 maná)</option>
           </select></label>
           {attackMode==="PHYSICAL"&&<>
             <label className="text-xs">Tipo<select className={inputClass} value={attackType}
               onChange={e=>setAttackType(e.target.value as typeof attackType)}>
               <option value="BLUNT">Contundente</option>
               <option value="CUT">Corte</option><option value="PIERCE">Perforante</option>
             </select></label>
             <label className="text-xs">Extremidad / arma<select className={inputClass}
               value={attackSource} onChange={e=>setAttackSource(e.target.value)}>
               <option value="FIST_RIGHT">Puño derecho</option>
               <option value="FIST_LEFT">Puño izquierdo</option>
               <option value="KICK">Patada</option>
               {player?.equippedWeapon&&<option value="MAIN_HAND">Arma principal</option>}
               {player?.offhandWeapon&&<option value="OFF_HAND">Arma secundaria</option>}
             </select></label>
             {[
               ["Inicio X",startX,setStartX],["Inicio Y",startY,setStartY],
               ["Final X",endX,setEndX],["Final Y",endY,setEndY],
             ].map(([label,value,setter])=><label key={label as string} className="text-xs">{label as string}
               <input className={inputClass} type="number" min="0" max="1" step=".05"
                 value={value as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)}/>
             </label>)}
           </>}
           {attackMode==="MAGIC"&&<>
             <label className="text-xs">Centro horizontal del objetivo X<input
               className={inputClass} type="number" min="0" max="1" step=".05"
               value={magicX} onChange={e=>setMagicX(e.target.value)}/></label>
             <label className="text-xs">Centro vertical del objetivo Y<input
               className={inputClass} type="number" min="0" max="1" step=".05"
               value={magicY} onChange={e=>setMagicY(e.target.value)}/></label>
           </>}
         </div>
         <label className="mt-3 flex items-center gap-2 text-xs">
           <input type="checkbox" checked={composite}
             onChange={e=>setComposite(e.target.checked)}/>
           Combinar con movimiento (2 PA, un intervalo)
         </label>
         {composite&&<div className="mt-2 grid grid-cols-3 gap-2">
           <label className="text-xs">Δ X (m)<input className={inputClass}
             type="number" step=".1" value={moveX}
             onChange={e=>setMoveX(e.target.value)}/></label>
           <label className="text-xs">Δ Y (m)<input className={inputClass}
             type="number" step=".1" value={moveY}
             onChange={e=>setMoveY(e.target.value)}/></label>
           <label className="text-xs">Orden<select className={inputClass}
             value={order} onChange={e=>setOrder(e.target.value as typeof order)}>
             <option value="BEFORE">Mover primero</option>
             <option value="AFTER">Atacar primero</option>
           </select></label>
         </div>}
         <div className="mt-3 flex flex-wrap gap-2">
           <button className={btn} disabled={!canSend||composite&&!validMove()}
             onClick={()=>send({kind:"ATTACK",...attackArgs()})}>Atacar</button>
           <button className={btn} disabled={!canSend||!validMove()}
             onClick={()=>send({kind:"MOVE",direction:"VECTOR",
               planarMove:movement(),meters:Math.hypot(moveX===""?0:number(moveX),
                 moveY===""?0:number(moveY))})}>Mover sin atacar</button>
         </div>
         <h3 className="mt-5 mb-2 text-sm font-semibold">Postura defensiva previa</h3>
         <div className="flex flex-wrap gap-2">
           {(["DODGE","ENDURE","REPEL","COUNTER","DEFLECT","MAGIC_FIELD"] as const)
             .map(defense=><button key={defense} className={btn} disabled={!canSend}
             onClick={()=>send({kind:"PREPARE_REACTION",defense,
               ...(defense==="DODGE"?{predictedCenter:center()}:{}) ,
               ...(defense==="DEFLECT"?{defenseAngle:90}:{})})}>
               {({DODGE:"Esquivar",ENDURE:"Resistir",REPEL:"Repeler",
                 COUNTER:"Contraatacar",DEFLECT:"Desviar 90°",
                 MAGIC_FIELD:"Campo mágico"} as const)[defense]}</button>)}
         </div>
         <h3 className="mt-5 mb-2 text-sm font-semibold">Habilidad aprobada</h3>
         <div className="flex flex-wrap items-end gap-2">
           <label className="min-w-28 flex-1 text-xs">ID de habilidad
             <input className={inputClass} type="number" min="1"
               value={skillId} onChange={e=>setSkillId(e.target.value)}/></label>
           <label className="min-w-28 flex-1 text-xs">Familia
             <select className={inputClass} value={skillKind}
               onChange={e=>setSkillKind(e.target.value)}>
               <option value="OFFENSE">Ataque</option>
               <option value="SUPPORT">Soporte</option>
               <option value="SUMMON">Invocación</option>
               <option value="CONSTRUCTION">Construcción</option>
             </select></label>
           <button className={btn} disabled={!canSend||!Number.isSafeInteger(Number(skillId))||Number(skillId)<1}
             onClick={()=>send({kind:"CAST_SKILL",skillId:Number(skillId),
               ...(skillKind==="OFFENSE"?{
                 ...(attackMode==="MAGIC"?{areaCenter:center()}:
                   {trajectory:trajectory(),attackSource}),
                 ...(composite&&validMove()?{planarMove:movement(),movementOrder:order}:{})
               }:{}),
               ...(skillKind==="CONSTRUCTION"?{areaCenter:center()}:{})
             })}>Activar</button>
         </div>
         <h3 className="mt-5 mb-2 text-sm font-semibold">Consumible</h3>
         <div className="flex flex-wrap gap-2">
           <select className={inputClass+" min-w-0 flex-1"} value={itemCopy}
             onChange={e=>setItemCopy(e.target.value)}>
             <option value="">Selecciona una poción…</option>
             {options.map(x=><option key={x.characterItemId??x.itemId}
               value={String(x.characterItemId??x.itemId)}>
               {x.name} · {x.action==="HEAL_HP"?"HP":"Maná"} +{x.amount}
               {" · ×"+x.quantity}</option>)}
           </select>
           <button className={btn} disabled={!canSend||!itemCopy}
             onClick={()=>{const selected=options.find(x=>
               String(x.characterItemId??x.itemId)===itemCopy);
               if(selected)send({kind:"USE_ITEM",itemId:selected.itemId,
                 characterItemId:selected.characterItemId});}}>Usar</button>
         </div>
         <h3 className="mt-5 mb-2 text-sm font-semibold">Ordenar a una invocación</h3>
         <div className="flex flex-wrap gap-2">
           <select className={inputClass+" min-w-0 flex-1"} value={summonId}
             onChange={e=>setSummonId(e.target.value)}>
             <option value="">Invocación…</option>
             {creatures.map(x=><option key={x.id} value={x.id}>{x.label} · {x.behavior.mode}</option>)}
           </select>
           <select className={inputClass+" min-w-0 flex-1"} value={summonMode}
             onChange={e=>setSummonMode(e.target.value)}>
             {["FOLLOW","ATTACK","PROTECT","HOLD","MANUAL"].map(mode=>
               <option key={mode} value={mode}>{mode}</option>)}
           </select>
           <button className={btn} disabled={!canSend||!summonId}
             onClick={()=>send({kind:"COMMAND_SUMMON",summonId,
               order:"CHANGE_BEHAVIOR",newBehavior:summonMode})}>Cambiar orden</button>
         </div>
       </section>
     </div>
     <section className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
       <h2 className="mb-3 font-semibold">Crónica por ticks</h2>
       <div aria-live="polite" className="max-h-96 space-y-2 overflow-auto text-sm text-zinc-300">
         {data.state.log.length===0?<p>Aún no hay acciones completadas.</p>:
           data.state.log.slice(-40).map((entry,index)=>
             <div key={entry.tick+"-"+entry.kind+"-"+index}
               className="border-b border-zinc-800 pb-2">
               <span className="mr-2 text-xs tabular-nums text-cyan-300">{entry.tick}</span>
               {entry.summary}
             </div>)}
       </div>
     </section>
   </>}
 </main>;
}
