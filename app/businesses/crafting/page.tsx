"use client";

import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Hammer,PackageCheck} from "lucide-react";
import type {ManagedCraftRecipe} from "@/lib/managed-crafting";

type Offer={
 businessId:number;businessName:string;
 recipe:ManagedCraftRecipe;
 output:{id:number;name:string;itemType:string};
 materials:{itemId:number;name:string;quantity:number}[];
};
type Character={id:number;name:string;money:number};
type Owned={id:number;itemId:number;quantity:number;equipped:boolean};
const field="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3";
export default function CraftingPage(){
 const [offers,setOffers]=useState<Offer[]>([]);
 const [characters,setCharacters]=useState<Character[]>([]);
 const [inventory,setInventory]=useState<Owned[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [recipeId,setRecipeId]=useState("");
 const [characterId,setCharacterId]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const currentRequest=useRef<{signature:string;requestId:string}|null>(null);
 useEffect(()=>{
  let alive=true;
  Promise.all([
   fetch("/api/businesses/crafting",{cache:"no-store"}).then(async r=>{
    const x=await r.json();if(!r.ok)throw new Error(x.error);return x;}),
   fetch("/api/characters?mine=true",{cache:"no-store"}).then(async r=>{
    const x=await r.json();if(!r.ok)throw new Error(x.error);return x;})
  ]).then(([catalog,characters])=>{
   if(!alive)return;
   const items=(catalog.offers??[]) as Offer[];
   const chars=Array.isArray(characters)?characters as Character[]:[];
   setOffers(items);setCharacters(chars);
   if(items.length){setBusinessId(String(items[0].businessId));setRecipeId(items[0].recipe.id);}
   if(chars.length)setCharacterId(String(chars[0].id));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:"No se pudieron cargar las forjas.");})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[]);
 async function loadInventory(id:string){
  if(!id){setInventory([]);return;}
  const r=await fetch("/api/characters/"+id,{cache:"no-store"});
  const data=await r.json();if(!r.ok)throw new Error(data.error??"No se pudo cargar el inventario.");
  setInventory((data.equipment??[]) as Owned[]);
 }
 useEffect(()=>{
  let alive=true;
  if(characterId)loadInventory(characterId).catch(e=>{
   if(alive)setError(e instanceof Error?e.message:"Error de inventario.");
  });
  else setInventory([]);
  return ()=>{alive=false;};
 },[characterId]);
 const shops=[...new Map(offers.map(x=>[x.businessId,x.businessName])).entries()];
 const inShop=offers.filter(x=>String(x.businessId)===businessId);
 const selected=inShop.find(x=>x.recipe.id===recipeId)??inShop[0];
 const character=characters.find(x=>String(x.id)===characterId);
 const holdings=(itemId:number)=>inventory.filter(x=>x.itemId===itemId&&!x.equipped)
  .reduce((sum,x)=>sum+Number(x.quantity),0);
 const canCraft=!!selected&&!!character&&Number(character.money)>=selected.recipe.fee&&
  selected.materials.every(x=>holdings(x.itemId)>=x.quantity)&&!busy;
 async function craft(){
  if(!selected||!characterId||busy)return;
  setBusy(true);setError("");setMessage("");
  const signature=[selected.businessId,selected.recipe.id,characterId].join(":");
  if(!currentRequest.current||currentRequest.current.signature!==signature)
   currentRequest.current={
    signature,requestId:"Craft"+crypto.randomUUID().replaceAll("-","")
   };
  try{
   const r=await fetch("/api/businesses/crafting",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     businessId:selected.businessId,recipeId:selected.recipe.id,
     characterId:Number(characterId),requestId:currentRequest.current.requestId
    })
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"No se pudo fabricar.");
   currentRequest.current=null;
   setMessage((data.replayed?"Encargo recuperado: ":"Fabricación completada: ")+
    data.quantity+" × "+data.itemName+" añadidos al inventario. Coste: ◈ "+data.fee+".");
   setCharacters(xs=>xs.map(x=>x.id===Number(characterId)?{...x,money:data.money}:x));
   await loadInventory(characterId);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo completar el encargo.");}
  finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-zinc-950 px-5 py-8 text-white">
  <div className="mx-auto max-w-3xl space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div>
     <h1 className="flex items-center gap-2 text-3xl font-bold"><Hammer size={27}/> Forjas y fabricación</h1>
     <p className="mt-2 text-sm text-zinc-400">Encarga un objeto del catálogo con tus materiales. Las recetas y los negocios habilitados los decide Gestión.</p>
    </div>
    <Link href="/businesses/catalog" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Volver a negocios</Link>
   </div>
   {error&&<p role="alert" className="rounded-lg border border-red-700 p-3 text-sm text-red-300">{error}</p>}
   {message&&<p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-700 p-3 text-sm text-emerald-300">
    <PackageCheck size={18}/>{message}</p>}
   {loading?<p className="text-zinc-400">Cargando recetas…</p>:
    <section className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
     {shops.length===0?<p className="text-sm text-zinc-400">Todavía no hay talleres de fabricación autorizados con recetas activas.</p>:
      <>
       <label className="block text-sm">Taller
        <select className={field} value={businessId} onChange={e=>{
         setBusinessId(e.target.value);
         setRecipeId(offers.find(x=>String(x.businessId)===e.target.value)?.recipe.id??"");
         currentRequest.current=null;setMessage("");
        }}>{shops.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
       </label>
       <label className="block text-sm">Receta autorizada
        <select className={field} value={selected?.recipe.id??""} onChange={e=>{
         setRecipeId(e.target.value);currentRequest.current=null;setMessage("");
        }}>{inShop.map(x=><option key={x.recipe.id} value={x.recipe.id}>
         {x.recipe.kind==="FORGE"?"Forjar":"Fabricar"} · {x.recipe.name}
        </option>)}</select>
       </label>
      </>}
     <label className="block text-sm">Personaje que paga, entrega los materiales y recibe el objeto
      <select className={field} value={characterId} onChange={e=>{
       setCharacterId(e.target.value);currentRequest.current=null;setMessage("");
      }}>{characters.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
     </label>
     <p className="text-sm text-amber-200">Dinero disponible: ◈ {Number(character?.money??0).toLocaleString("es-MX")}</p>
     {selected&&<div className="space-y-3 rounded-xl border border-amber-800/40 p-4">
      <div className="flex items-start justify-between gap-2">
       <div><h2 className="font-semibold">{selected.recipe.name}</h2>
        <p className="mt-1 text-xs text-zinc-400">{selected.recipe.description}</p></div>
       <span className="whitespace-nowrap text-sm text-amber-300">◈ {selected.recipe.fee}</span>
      </div>
      <p className="text-sm">Resultado: <strong>{selected.recipe.outputQuantity} × {selected.output.name}</strong></p>
      <h3 className="text-sm font-medium text-zinc-300">Materiales que se consumirán</h3>
      <ul className="space-y-1 text-sm">
       {selected.materials.map(x=><li key={x.itemId} className={
        holdings(x.itemId)>=x.quantity?"text-emerald-300":"text-rose-300"}>
        {x.quantity} × {x.name} · Tienes {holdings(x.itemId)}
       </li>)}
      </ul>
      {selected.recipe.requiresEmployee&&<p className="text-xs text-sky-300">Requiere empleado contratado activo.</p>}
      {selected.recipe.customerAccess==="OWNER_ONLY"&&
       <p className="text-xs text-orange-300">Solo el personaje dueño puede encargar esta receta.</p>}
      <p className="text-xs text-zinc-500">El encargo consume materiales sin equipar y dinero en una única transacción, y entrega objetos reales al inventario. No se puede fabricar durante un combate.</p>
      <button type="button" disabled={!canCraft} onClick={()=>void craft()}
       className="w-full rounded-lg bg-amber-300 p-3 font-semibold text-zinc-950 disabled:opacity-35">
       {busy?"Fabricando…":selected.recipe.kind==="FORGE"?"Encargar forja":"Fabricar objeto"}
      </button>
     </div>}
    </section>}
  </div>
 </main>;
}
