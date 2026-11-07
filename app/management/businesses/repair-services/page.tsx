"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {MicroEffectBuilder} from "@/components/effects/MicroEffectBuilder";
import {defaultBusinessRepairModule} from "@/lib/business-repair";
import type {ManagedRepairService} from "@/lib/managed-repair-services";

type Material={id:number;name:string};
type Business={id:number;name:string;active:boolean};
const endpoint="/api/management/businesses/repair-services";
const empty=():ManagedRepairService=>({
 id:"",name:"Reparación de herrería",description:"Restauración de la durabilidad del equipo.",
 active:true,fee:50,materialItemId:null,materialQuantity:0,
 customerAccess:"PUBLIC",requiresEmployee:false,module:defaultBusinessRepairModule(),
 businessIds:[]
});
export default function ManagedRepairServicesPage(){
 const [services,setServices]=useState<ManagedRepairService[]>([]);
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [materials,setMaterials]=useState<Material[]>([]);
 const [draft,setDraft]=useState<ManagedRepairService>(empty);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function load(){
  setLoading(true);setError("");
  try{
   const response=await fetch(endpoint,{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"No se pudo consultar el catálogo.");
   setServices(data.services??[]);
   setBusinesses(data.businesses??[]);
   setMaterials(data.materials??[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los servicios.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 async function action(mode:"save"|"delete",serviceId?:string){
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:mode,service:draft,serviceId}),
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"No se pudo guardar la configuración.");
   const next=data.services as ManagedRepairService[];
   setServices(next);
   setDraft(mode==="delete"?empty():next.find(x=>x.id===draft.id)??next.at(-1)??empty());
   setMessage(mode==="delete"?"Servicio retirado de todos los negocios.":"Servicio y negocios autorizados actualizados.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar el servicio.");}
  finally{setBusy(false);}
 }
 function toggleBusiness(id:number,checked:boolean){
  setDraft(current=>({
   ...current,businessIds:checked?
    [...current.businessIds,id].sort((a,b)=>a-b):
    current.businessIds.filter(value=>value!==id)
  }));
 }
 return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
  <div className="mx-auto max-w-4xl space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <Link href="/management/businesses" className="text-sm text-zinc-400 hover:text-white">← Gestión de negocios</Link>
     <h1 className="mt-3 text-3xl font-bold">Servicios de reparación</h1>
     <p className="mt-2 text-sm text-zinc-400">Define las reglas una sola vez y decide qué negocios pueden ofrecer cada servicio. Los propietarios no pueden cambiar precios, materiales ni efectos.</p>
    </div>
    <button onClick={()=>{setDraft(empty());setError("");setMessage("");}} type="button"
     className="rounded-lg border border-cyan-500/60 px-4 py-2 text-sm text-cyan-200">Nuevo servicio</button>
   </div>
   {error&&<p role="alert" className="rounded-lg border border-rose-700/60 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</p>}
   {message&&<p role="status" className="rounded-lg border border-emerald-600/50 p-3 text-sm text-emerald-300">{message}</p>}
   {loading?<p className="text-zinc-400">Cargando catálogo…</p>:<div className="space-y-5">
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
     <label className="text-sm font-medium">Editar servicio existente
      <select value={draft.id} onChange={e=>setDraft(services.find(x=>x.id===e.target.value)??empty())}
       className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3">
       <option value="">Crear un servicio nuevo</option>
       {services.map(service=><option key={service.id} value={service.id}>{service.name} · {service.businessIds.length} negocios</option>)}
      </select>
     </label>
    </section>
    <section className="space-y-4 rounded-xl border border-amber-700/40 bg-zinc-900/20 p-4">
     <h2 className="font-semibold text-amber-200">Definición del servicio</h2>
     <label className="block text-sm">Nombre
      <input value={draft.name} onChange={e=>setDraft(x=>({...x,name:e.target.value}))}
       className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2"/></label>
     <label className="block text-sm">Descripción
      <textarea value={draft.description} rows={2}
       onChange={e=>setDraft(x=>({...x,description:e.target.value}))}
       className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2"/></label>
     <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Tarifa en ◈
       <input type="number" min={0} max={1000000} step={1} value={draft.fee}
        onChange={e=>setDraft(x=>({...x,fee:Number(e.target.value)}))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2"/></label>
      <label className="block text-sm">Material que aporta el cliente
       <select value={draft.materialItemId??""}
        onChange={e=>setDraft(x=>({...x,materialItemId:e.target.value?Number(e.target.value):null,
         materialQuantity:e.target.value?(x.materialQuantity||1):0}))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2">
        <option value="">Sin materiales</option>
        {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
       </select></label>
      {draft.materialItemId!==null&&<label className="block text-sm">Cantidad de material
       <input type="number" min={1} max={100} step={1} value={draft.materialQuantity}
        onChange={e=>setDraft(x=>({...x,materialQuantity:Number(e.target.value)}))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2"/></label>}
      <label className="block text-sm">Clientes admitidos
       <select value={draft.customerAccess} onChange={e=>setDraft(x=>({...x,
        customerAccess:e.target.value as ManagedRepairService["customerAccess"]}))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2">
        <option value="PUBLIC">Público</option>
        <option value="OWNER_ONLY">Solo el personaje propietario</option>
       </select></label>
     </div>
     <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.requiresEmployee}
       onChange={e=>setDraft(x=>({...x,requiresEmployee:e.target.checked}))}/>
      Requiere empleado contratado y activo
     </label>
     <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.active}
       onChange={e=>setDraft(x=>({...x,active:e.target.checked}))}/>
      Servicio habilitado globalmente
     </label>
     <div className="rounded-xl border border-zinc-700 p-3">
      <h3 className="mb-2 font-medium">Fórmula de reparación</h3>
      <MicroEffectBuilder value={draft.module} onChange={module=>setDraft(x=>({...x,module}))}/>
      <p className="mt-2 text-xs text-zinc-400">Solo se permite leer el objeto seleccionado, leer estadísticas del reparador, calcular y restaurar durabilidad.</p>
     </div>
    </section>
    <section className="rounded-xl border border-emerald-700/40 bg-zinc-900/20 p-4">
     <h2 className="font-semibold text-emerald-200">Negocios autorizados</h2>
     <p className="mt-1 text-xs text-zinc-400">Sin autorización, ningún negocio puede ofrecer este servicio, aunque un propietario intente activarlo desde otra página.</p>
     <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
      {businesses.map(b=><label key={b.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3 text-sm">
       <input type="checkbox" checked={draft.businessIds.includes(b.id)}
        onChange={e=>toggleBusiness(b.id,e.target.checked)}/>
       <span>{b.name}{!b.active&&<small className="ml-1 text-amber-300">(inactivo)</small>}</span>
      </label>)}
     </div>
     {businesses.length===0&&<p className="mt-2 text-sm text-zinc-500">Aún no hay negocios registrados.</p>}
    </section>
    <div className="flex flex-wrap gap-3">
     <button type="button" disabled={busy} onClick={()=>void action("save")}
      className="rounded-lg bg-emerald-300 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-50">
      {busy?"Guardando…":"Guardar servicio y autorizaciones"}
     </button>
     {draft.id&&<button type="button" disabled={busy} onClick={()=>{
      if(window.confirm("¿Retirar este servicio de todos los negocios?"))void action("delete",draft.id);
     }} className="rounded-lg border border-rose-700 px-4 py-3 text-rose-300 disabled:opacity-50">
      Retirar servicio</button>}
    </div>
   </div>}
  </div>
 </main>;
}
