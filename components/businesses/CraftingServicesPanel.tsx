"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import type {ManagedCraftRecipe} from "@/lib/managed-crafting";

type Offer={
 recipe:ManagedCraftRecipe;
 output:{name:string};
 materials:{name:string;quantity:number}[];
};
export default function CraftingServicesPanel({businessId}:{businessId:number}){
 const [offers,setOffers]=useState<Offer[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let live=true;setError("");setLoading(true);
  fetch("/api/businesses/crafting?businessId="+businessId,{cache:"no-store"})
   .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);
    if(live)setOffers(data.offers??[]);
   }).catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudo consultar las recetas.");})
    .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[businessId]);
 return <section className="mt-5 rounded-xl border border-amber-700/40 bg-zinc-950/60 p-4">
  <h3 className="font-semibold text-amber-200">Forja y fabricación autorizadas</h3>
  <p className="mt-1 text-xs text-zinc-400">Las recetas, sus materiales y tarifas los define Gestión. Tu negocio solo puede ofrecer las que se le asignaron.</p>
  {loading?<p className="mt-3 text-xs text-zinc-500">Consultando recetas…</p>:
   error?<p role="alert" className="mt-3 text-xs text-red-300">{error}</p>:
   offers.length?<ul className="mt-3 space-y-2">
    {offers.map(x=><li key={x.recipe.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
     <p className="font-medium">{x.recipe.kind==="FORGE"?"Forja":"Fabricación"} · {x.recipe.name}</p>
     <p className="mt-1 text-xs text-zinc-300">{x.recipe.outputQuantity} × {x.output.name} · ◈ {x.recipe.fee}</p>
     <p className="mt-1 text-xs text-zinc-500">{x.materials.map(m=>m.quantity+" × "+m.name).join(", ")}</p>
    </li>)}
   </ul>:<p className="mt-3 text-sm text-zinc-500">Gestión todavía no ha habilitado recetas para este negocio.</p>}
  <Link href="/businesses/crafting"
   className="mt-3 inline-block rounded-lg border border-amber-500/50 px-3 py-2 text-xs text-amber-200">
   Ver encargos de fabricación
  </Link>
 </section>;
}
