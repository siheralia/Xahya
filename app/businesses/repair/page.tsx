"use client";

import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import type {RepairService} from "@/lib/business-repair";

type Business={id:number;name:string;description:string|null};
type Character={id:number;name:string;money:number};
type Owned={id:number;itemId:number;quantity:number;durability?:number;equipped?:boolean;
 item?:{name:string;itemType:string}|null};
type Material={id:number;name:string};

export default function BusinessRepairPage(){
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [characters,setCharacters]=useState<Character[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [characterId,setCharacterId]=useState("");
 const [services,setServices]=useState<RepairService[]>([]);
 const [materials,setMaterials]=useState<Material[]>([]);
 const [inventory,setInventory]=useState<Owned[]>([]);
 const [serviceId,setServiceId]=useState("");
 const [itemId,setItemId]=useState("");
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [busy,setBusy]=useState(false);
 const operation=useRef<{signature:string;requestId:string}|null>(null);
 useEffect(()=>{
  let active=true;
  Promise.all([
   fetch("/api/businesses/catalog",{cache:"no-store"}).then(r=>r.json()),
   fetch("/api/characters?mine=true",{cache:"no-store"}).then(r=>r.json()),
  ]).then(([catalog,c])=>{
   if(!active)return;
   const shops=(catalog?.businesses??[]) as Business[];
   const chars=Array.isArray(c)?c as Character[]:[];
   setBusinesses(shops);setCharacters(chars);
   if(shops.length)setBusinessId(String(shops[0].id));
   if(chars.length)setCharacterId(String(chars[0].id));
  }).catch(()=>{if(active)setError("No se pudieron cargar tus personajes y negocios.");});
  return ()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!businessId)return;
  let active=true;
  fetch("/api/businesses/repair-services?businessId="+businessId,{cache:"no-store"})
   .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;})
   .then(data=>{if(!active)return;
    const rows=(data.services??[] as RepairService[]).filter((s:RepairService)=>s.active);
    setServices(rows);setMaterials(data.materials??[]);
    setServiceId(rows[0]?.id??"");
   }).catch(e=>{if(active){setServices([]);setError(e instanceof Error?e.message:"No se pudo cargar el taller.");}});
  return ()=>{active=false;};
 },[businessId]);
 async function loadInventory(id:string){
  if(!id)return;
  const response=await fetch("/api/characters/"+id,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??"No se pudo consultar el inventario.");
  const owned=(data.equipment??[]) as Owned[];
  setInventory(owned);setItemId(old=>
   owned.some(x=>String(x.id)===old&&x.quantity===1&&Number(x.durability??100)<100)
   ?old:String(owned.find(x=>x.quantity===1&&Number(x.durability??100)<100&&
     ["WEAPON","ARMOR","ACCESSORY","OTHER"].includes(x.item?.itemType??""))?.id??""));
 }
 useEffect(()=>{
  let active=true;
  if(characterId)loadInventory(characterId).catch(e=>{if(active)setError(e instanceof Error?e.message:"No se pudo consultar el inventario.");});
  return ()=>{active=false;};
 },[characterId]);
 const selected=services.find(s=>s.id===serviceId);
 const character=characters.find(c=>String(c.id)===characterId);
 const selectedMaterial=materials.find(m=>m.id===selected?.materialItemId);
 const ownedMaterial=selected?.materialItemId==null?0:inventory
  .filter(x=>x.itemId===selected.materialItemId&&!x.equipped&&x.id!==Number(itemId))
  .reduce((sum,x)=>sum+x.quantity,0);
 const items=inventory.filter(x=>x.quantity===1&&Number(x.durability??100)<100&&
   ["WEAPON","ARMOR","ACCESSORY","OTHER"].includes(x.item?.itemType??""));
 const canPay=!!selected&&!!itemId&&!!character&&character.money>=selected.fee&&
  (selected.materialItemId===null||ownedMaterial>=selected.materialQuantity);
 async function hire(){
  if(!selected||!characterId||!itemId||!businessId||busy)return;
  setBusy(true);setError("");setSuccess("");
  const signature=[businessId,serviceId,characterId,itemId].join(":");
  if(!operation.current||operation.current.signature!==signature)
   operation.current={signature,requestId:"Workshop"+crypto.randomUUID().replaceAll("-","")};
  try{
   const response=await fetch("/api/businesses/repair",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId:Number(businessId),serviceId,characterId:Number(characterId),
     characterItemId:Number(itemId),requestId:operation.current.requestId}),
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"El taller no pudo reparar el equipo.");
   operation.current=null;
   setSuccess("Reparación completada: +"+data.restored+" durabilidad. Pagaste ◈ "+data.fee+".");
   setCharacters(current=>current.map(c=>c.id===Number(characterId)?{...c,money:data.money}:c));
   await loadInventory(characterId);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo completar la reparación.");}
  finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-zinc-950 text-white">
  <div className="mx-auto max-w-3xl px-5 py-8">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-3xl font-bold">Talleres de reparación</h1>
     <p className="mt-2 text-sm text-zinc-400">Restaura el equipo de tus personajes en los negocios de Xahya.</p></div>
    <Link href="/businesses/catalog" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Volver a negocios</Link>
   </div>
   <section className="mt-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
    <label className="block text-sm">Negocio
     <select value={businessId} onChange={e=>{setBusinessId(e.target.value);operation.current=null;setSuccess("");}}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">Personaje que paga y entrega el objeto
     <select value={characterId} onChange={e=>{setCharacterId(e.target.value);operation.current=null;setSuccess("");}}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      {characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>
    </label>
    <p className="text-xs text-amber-300">Dinero disponible: ◈ {Number(character?.money??0).toLocaleString("es-MX")}</p>
    <label className="block text-sm">Servicio
     <select value={serviceId} onChange={e=>{setServiceId(e.target.value);operation.current=null;setSuccess("");}}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      {services.map(s=><option key={s.id} value={s.id}>{s.name} · ◈ {s.fee}</option>)}
     </select>
    </label>
    {selected?<div className="rounded-lg border border-amber-800/40 p-4 text-sm">
     <p className="font-medium">{selected.name}</p>
     <p className="mt-1 text-zinc-400">{selected.description}</p>
     <p className="mt-3">Tarifa: <span className="text-amber-300">◈ {selected.fee}</span></p>
     <p className="mt-1">Material: {selected.materialItemId===null?"No requiere":selected.materialQuantity+" × "+(selectedMaterial?.name??"Material")}</p>
     {selected.materialItemId!==null&&<p className="mt-1 text-xs text-zinc-400">Tienes {ownedMaterial} unidades sin equipar.</p>}
     {selected.requiresEmployee&&<p className="mt-2 text-xs text-sky-300">Requiere empleado contratado activo.</p>}
     {selected.customerAccess==="OWNER_ONLY"&&<p className="mt-2 text-xs text-orange-300">Solo para el personaje dueño del negocio.</p>}
    </div>:<p className="text-sm text-zinc-500">Este negocio no tiene servicios activos de reparación.</p>}
    <label className="block text-sm">Ejemplar dañado del inventario
     <select value={itemId} onChange={e=>{setItemId(e.target.value);operation.current=null;setSuccess("");}}
      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      {items.map(item=><option key={item.id} value={item.id}>{item.item?.name??"Objeto"} · {item.durability??100}/100</option>)}
     </select>
    </label>
    <p className="text-xs text-zinc-500">El taller calcula la reparación desde el micromódulo de su dueño. Solo se cobran materiales y dinero si la reparación tiene éxito. No funciona en combate.</p>
    <button type="button" disabled={!canPay||busy} onClick={hire}
     className="w-full rounded-lg bg-white p-3 font-semibold text-black disabled:opacity-40">
     {busy?"Procesando reparación...":"Reparar objeto"}</button>
    {error&&<p className="text-sm text-red-300">{error}</p>}
    {success&&<p className="text-sm text-emerald-300">{success}</p>}
   </section>
  </div>
 </main>;
}
