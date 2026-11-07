"use client";

import {useEffect,useState} from "react";
import {MicroEffectBuilder} from "@/components/effects/MicroEffectBuilder";
import {defaultBusinessRepairModule,type RepairService} from "@/lib/business-repair";

type Material={id:number;name:string};
const empty=():RepairService=>({
 id:"",name:"Reparación de herrería",description:"Restauración de la durabilidad del equipo.",
 active:true,fee:50,materialItemId:null,materialQuantity:0,
 customerAccess:"PUBLIC",requiresEmployee:false,module:defaultBusinessRepairModule(),
});
export default function RepairServicesPanel({businessId}:{businessId:number}){
 const [services,setServices]=useState<RepairService[]>([]);
 const [materials,setMaterials]=useState<Material[]>([]);
 const [draft,setDraft]=useState<RepairService>(empty);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function load(){
  setLoading(true);
  try{
   const res=await fetch("/api/businesses/repair-services?businessId="+businessId,{cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"No se pudo consultar el taller.");
   setServices(data.services??[]);setMaterials(data.materials??[]);
  }catch(e){setError(e instanceof Error?e.message:"Error de taller.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[businessId]);
 async function action(action:"save"|"delete",serviceId?:string){
  setBusy(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/businesses/repair-services",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,businessId,service:draft,serviceId}),
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"No se pudo guardar el servicio.");
   const next=data.services as RepairService[];
   setServices(next);setDraft(next.find(x=>x.id===(serviceId??draft.id))??next.at(-1)??empty());
   setMessage(action==="save"?"Servicio guardado.":"Servicio eliminado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar el servicio.");}
  finally{setBusy(false);}
 }
 return <section className="mt-6 rounded-xl border border-amber-700/40 bg-zinc-950/60 p-4">
  <h3 className="font-semibold text-amber-200">Servicios de reparación</h3>
  <p className="mt-1 text-xs text-zinc-400">Configura tarifas, materiales y una fórmula de restauración con micromódulos.
   El cobro y la reparación del ejemplar se realizan juntos.</p>
  {loading?<p className="mt-3 text-xs text-zinc-500">Cargando taller...</p>:<div className="mt-4 space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <select value={draft.id} onChange={e=>
      setDraft(services.find(s=>s.id===e.target.value)??empty())}
      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm">
     <option value="">Nuevo servicio</option>
     {services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
    <button type="button" onClick={()=>setDraft(empty())}
     className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Nuevo</button>
   </div>
   <label className="block text-xs">Nombre del servicio
    <input value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}
     className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"/>
   </label>
   <label className="block text-xs">Descripción
    <input value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}
     className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"/>
   </label>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-xs">Tarifa en ◈
     <input type="number" min={0} max={1000000} step={1} value={draft.fee}
      onChange={e=>setDraft(v=>({...v,fee:Number(e.target.value)}))}
      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"/>
    </label>
    <label className="block text-xs">Material que aporta el cliente
     <select value={draft.materialItemId??""} onChange={e=>setDraft(v=>({
      ...v,materialItemId:e.target.value?Number(e.target.value):null,
      materialQuantity:e.target.value?(v.materialQuantity||1):0}))}
      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm">
      <option value="">Sin materiales</option>
      {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
     </select>
    </label>
    {draft.materialItemId!==null&&<label className="block text-xs">Unidades de material
     <input type="number" min={1} max={100} value={draft.materialQuantity} step={1}
      onChange={e=>setDraft(v=>({...v,materialQuantity:Number(e.target.value)}))}
      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"/>
    </label>}
    <label className="block text-xs">Quién puede contratarlo
     <select value={draft.customerAccess} onChange={e=>setDraft(v=>({
      ...v,customerAccess:e.target.value as RepairService["customerAccess"]}))}
      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm">
      <option value="PUBLIC">Cualquier personaje</option>
      <option value="OWNER_ONLY">Solo el personaje propietario</option>
     </select>
    </label>
   </div>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.requiresEmployee}
    onChange={e=>setDraft(v=>({...v,requiresEmployee:e.target.checked}))}/>
    Requiere al menos un empleado contratado y activo</label>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.active}
    onChange={e=>setDraft(v=>({...v,active:e.target.checked}))}/>
    Servicio disponible para clientes</label>
   <div className="rounded-xl border border-zinc-800 p-3">
    <p className="mb-2 text-sm font-medium">Fórmula de restauración</p>
    <MicroEffectBuilder value={draft.module} onChange={module=>setDraft(v=>({...v,module}))}/>
    <p className="mt-2 text-xs text-zinc-500">Usa «Leer objeto» → «Objeto seleccionado» y «Restaurar durabilidad».
     Puedes añadir lectura de estadísticas del propietario del negocio y cálculos.
     No admite daño, curación ni objetivos ajenos.</p>
   </div>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={()=>action("save")}
     className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40">
     {busy?"Guardando...":"Guardar servicio"}</button>
    {draft.id&&<button type="button" disabled={busy} onClick={()=>action("delete",draft.id)}
     className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300">Eliminar</button>}
   </div>
  </div>}
  {error&&<p className="mt-3 text-sm text-red-300">{error}</p>}
  {message&&<p className="mt-3 text-sm text-emerald-300">{message}</p>}
 </section>;
}
