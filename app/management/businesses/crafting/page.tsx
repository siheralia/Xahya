"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Hammer,Plus,Trash2} from "lucide-react";
import type {ManagedCraftRecipe} from "@/lib/managed-crafting";

type CatalogItem={id:number;name:string;itemType?:string};
type Business={id:number;name:string;active:boolean};
const endpoint="/api/management/businesses/crafting";
const fresh=():ManagedCraftRecipe=>({
 id:"",name:"",description:"",active:true,kind:"FORGE",
 fee:50,outputItemId:0,outputQuantity:1,
 ingredients:[{itemId:0,quantity:1}],customerAccess:"PUBLIC",
 requiresEmployee:false,businessIds:[]
});
const field="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm";
export default function CraftingManagementPage(){
 const [recipes,setRecipes]=useState<ManagedCraftRecipe[]>([]);
 const [materials,setMaterials]=useState<CatalogItem[]>([]);
 const [outputs,setOutputs]=useState<CatalogItem[]>([]);
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [draft,setDraft]=useState<ManagedCraftRecipe>(fresh);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const filtered=useMemo(()=>outputs.filter(x=>draft.kind!=="FORGE"||
  ["WEAPON","ARMOR","ACCESSORY"].includes(x.itemType??"")),[outputs,draft.kind]);
 async function load(){
  setLoading(true);setError("");
  try{
   const res=await fetch(endpoint,{cache:"no-store"});const data=await res.json();
   if(!res.ok)throw new Error(data.error??"No se pudieron consultar las recetas.");
   setRecipes(data.recipes??[]);setMaterials(data.materials??[]);
   setOutputs(data.outputs??[]);setBusinesses(data.businesses??[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir el catálogo.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 const update=(values:Partial<ManagedCraftRecipe>)=>setDraft(old=>({...old,...values}));
 async function save(action:"save"|"delete"){
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,recipe:draft,recipeId:draft.id})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"No se pudo guardar.");
   const list=data.recipes as ManagedCraftRecipe[];
   setRecipes(list);
   setDraft(action==="delete"?fresh():list.find(x=>x.id===draft.id)??list.at(-1)??fresh());
   setMessage(action==="delete"?"Receta retirada de todos los negocios.":"Receta guardada y autorizaciones actualizadas.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-zinc-950 px-5 py-8 text-white">
  <div className="mx-auto max-w-4xl space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <Link href="/management/businesses" className="text-sm text-zinc-400 hover:text-white">← Negocios y empleos</Link>
     <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold"><Hammer size={26}/> Forja y fabricación</h1>
     <p className="mt-2 text-sm text-zinc-400">Gestión crea las recetas y autoriza los talleres. El objeto resultante se toma del catálogo de objetos, sin permitir cambios libres de estadísticas o efectos.</p>
    </div>
    <button type="button" onClick={()=>{setDraft(fresh());setError("");setMessage("");}}
     className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-200">
     <Plus size={17}/> Nueva receta
    </button>
   </div>
   {error&&<p role="alert" className="rounded-xl border border-red-700/50 p-3 text-sm text-red-300">{error}</p>}
   {message&&<p role="status" className="rounded-xl border border-emerald-700/50 p-3 text-sm text-emerald-300">{message}</p>}
   {loading?<p className="text-zinc-400">Cargando catálogo…</p>:<div className="space-y-5">
    <section className="rounded-xl border border-zinc-800 p-4">
     <label className="block text-sm">Receta
      <select className={field} value={draft.id}
       onChange={e=>setDraft(recipes.find(x=>x.id===e.target.value)??fresh())}>
       <option value="">Crear receta nueva</option>
       {recipes.map(r=><option key={r.id} value={r.id}>{r.name} · {r.businessIds.length} negocios</option>)}
      </select>
     </label>
    </section>
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
     <h2 className="font-semibold text-amber-200">Definición de la receta</h2>
     <label className="block text-sm">Nombre
      <input className={field} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
     <label className="block text-sm">Descripción
      <textarea className={field} rows={2} value={draft.description}
       onChange={e=>update({description:e.target.value})}/></label>
     <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Proceso
       <select className={field} value={draft.kind} onChange={e=>update({
        kind:e.target.value as ManagedCraftRecipe["kind"],outputItemId:0
       })}>
        <option value="FORGE">Forjar equipo</option><option value="FABRICATE">Fabricar objetos</option>
       </select>
      </label>
      <label className="block text-sm">Objeto resultante (catálogo)
       <select className={field} value={draft.outputItemId}
        onChange={e=>update({outputItemId:Number(e.target.value)})}>
        <option value={0}>Selecciona un objeto fabricable</option>
        {filtered.map(item=><option key={item.id} value={item.id}>{item.name} · {item.itemType}</option>)}
       </select>
      </label>
      <label className="block text-sm">Unidades producidas por encargo
       <input className={field} type="number" min={1} max={10} step={1}
        value={draft.outputQuantity} onChange={e=>update({outputQuantity:Number(e.target.value)})}/>
      </label>
      <label className="block text-sm">Tarifa en ◈ (se entrega al negocio)
       <input className={field} type="number" min={0} max={1000000} step={1}
        value={draft.fee} onChange={e=>update({fee:Number(e.target.value)})}/>
      </label>
      <label className="block text-sm">Quién puede encargarla
       <select className={field} value={draft.customerAccess}
        onChange={e=>update({customerAccess:e.target.value as ManagedCraftRecipe["customerAccess"]})}>
        <option value="PUBLIC">Cualquier personaje</option>
        <option value="OWNER_ONLY">Solo el personaje dueño del negocio</option>
       </select>
      </label>
     </div>
     <div className="space-y-3 rounded-xl border border-zinc-700 p-3">
      <div className="flex items-center justify-between gap-3">
       <h3 className="font-medium">Materiales consumidos</h3>
       <button type="button" disabled={draft.ingredients.length>=8} onClick={()=>
        update({ingredients:[...draft.ingredients,{itemId:0,quantity:1}]})}
        className="flex items-center gap-1 rounded-lg border border-zinc-600 px-2 py-1 text-xs disabled:opacity-40">
        <Plus size={14}/> Añadir material
       </button>
      </div>
      {draft.ingredients.map((ingredient,i)=><div key={i} className="flex items-end gap-2">
       <label className="min-w-0 flex-1 text-xs">Material
        <select className={field} value={ingredient.itemId}
         onChange={e=>update({ingredients:draft.ingredients.map((m,j)=>j===i?{
          ...m,itemId:Number(e.target.value)}:m)})}>
         <option value={0}>Selecciona material</option>
         {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
       </label>
       <label className="w-24 text-xs">Cantidad
        <input className={field} type="number" min={1} max={100} step={1}
         value={ingredient.quantity} onChange={e=>update({ingredients:draft.ingredients.map((m,j)=>
          j===i?{...m,quantity:Number(e.target.value)}:m)})}/>
       </label>
       <button type="button" aria-label="Eliminar material" title="Eliminar material"
        disabled={draft.ingredients.length<=1} onClick={()=>update({ingredients:draft.ingredients.filter((_,j)=>j!==i)})}
        className="mb-1 rounded-lg border border-zinc-700 p-2.5 text-red-300 disabled:opacity-30">
        <Trash2 size={16}/>
       </button>
      </div>)}
     </div>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.requiresEmployee}
      onChange={e=>update({requiresEmployee:e.target.checked})}/> Exige un empleado contratado activo</label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active}
      onChange={e=>update({active:e.target.checked})}/> Receta disponible globalmente</label>
    </section>
    <section className="space-y-3 rounded-xl border border-emerald-800/40 p-4">
     <h2 className="font-semibold text-emerald-200">Negocios autorizados</h2>
     <p className="text-xs text-zinc-400">Solo los establecimientos marcados podrán fabricar esta receta. Cambiar la autorización surte efecto en el siguiente encargo.</p>
     <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
      {businesses.map(b=><label key={b.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3 text-sm">
       <input type="checkbox" checked={draft.businessIds.includes(b.id)}
        onChange={e=>update({businessIds:e.target.checked?
         [...draft.businessIds,b.id].sort((a,b)=>a-b):draft.businessIds.filter(id=>id!==b.id)})}/>
       <span>{b.name}{!b.active&&<small className="ml-1 text-amber-300">(inactivo)</small>}</span>
      </label>)}
     </div>
     {businesses.length===0&&<p className="text-sm text-zinc-500">No hay negocios disponibles.</p>}
    </section>
    <div className="flex flex-wrap gap-3">
     <button type="button" disabled={busy} onClick={()=>void save("save")}
      className="rounded-lg bg-amber-300 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-40">
      {busy?"Guardando…":"Guardar receta y autorizaciones"}
     </button>
     {draft.id&&<button type="button" disabled={busy} onClick={()=>{
      if(window.confirm("¿Retirar la receta de todos los talleres?"))void save("delete");
     }} className="rounded-lg border border-red-700 px-4 py-3 text-red-300 disabled:opacity-40">
      Retirar receta</button>}
    </div>
   </div>}
  </div>
 </main>;
}
