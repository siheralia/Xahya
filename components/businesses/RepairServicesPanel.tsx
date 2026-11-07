"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import type {RepairService} from "@/lib/business-repair";

export default function RepairServicesPanel({businessId}:{businessId:number}){
 const [services,setServices]=useState<RepairService[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  setLoading(true);setError("");
  fetch("/api/businesses/repair-services?businessId="+businessId,{cache:"no-store"})
   .then(async response=>{
    const data=await response.json();
    if(!response.ok)throw new Error(data.error??"No se pudieron consultar los servicios.");
    if(live)setServices(data.services??[]);
   }).catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudieron consultar los servicios.");})
    .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[businessId]);
 return <section className="mt-6 rounded-xl border border-amber-700/40 bg-zinc-950/60 p-4">
  <h3 className="font-semibold text-amber-200">Servicios de reparación autorizados</h3>
  <p className="mt-1 text-xs text-zinc-400">
   Gestión define los servicios, precios, materiales y efectos que puede ofrecer este negocio.
   El propietario no puede cambiar las reglas de los servicios.
  </p>
  {loading?<p className="mt-3 text-sm text-zinc-400">Cargando servicios…</p>:
   error?<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>:
   services.length?<ul className="mt-3 space-y-2">
    {services.map(s=><li key={s.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
     <p className="font-semibold">{s.name} · ◈ {s.fee}</p>
     {s.description&&<p className="mt-1 text-zinc-400">{s.description}</p>}
     <p className="mt-1 text-xs text-zinc-400">{s.active?"Disponible":"Deshabilitado por Gestión"}
      {s.materialItemId!==null?" · Requiere "+s.materialQuantity+" unidades del material autorizado":""}
     </p>
    </li>)}
   </ul>:<p className="mt-3 text-sm text-zinc-400">Gestión no ha habilitado servicios para este negocio.</p>}
  <Link href="/businesses/repair" className="mt-4 inline-block rounded-lg border border-amber-500/60 px-3 py-2 text-xs text-amber-200">
   Ver talleres de reparación
  </Link>
 </section>;
}
