"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";
import {materialTypeCodeFromName,type MaterialTypeDraft} from "@/lib/items/material-types";

type MaterialType=MaterialTypeDraft;
type Caps={create:boolean;edit:boolean;delete:boolean};
const fields=[
 ["obtaining","Obtención"],
 ["naturalForm","Forma natural"],
 ["minimumForm","Forma mínima"],
 ["rawForm","Forma en bruto"],
 ["marketForm","Forma comercial"],
 ["fireReaction","Reacción al fuego"],
 ["lightningReaction","Reacción a los rayos"],
 ["iceReaction","Reacción al hielo"],
] as const;
const blank=():MaterialTypeDraft=>({code:"",name:"",obtaining:null,naturalForm:null,
 minimumForm:null,rawForm:null,marketForm:null,fireReaction:null,
 lightningReaction:null,iceReaction:null,active:true});
const field="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
export default function MaterialTypesPage(){
 const [types,setTypes]=useState<MaterialType[]>([]);
 const [caps,setCaps]=useState<Caps>({create:false,edit:false,delete:false});
 const [filter,setFilter]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [editCode,setEditCode]=useState<string|null>(null);
 const [form,setForm]=useState<MaterialTypeDraft>(blank);
 const [open,setOpen]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function load(){
  setLoading(true);
  try{
   const response=await fetch("/api/management/material-types",{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"No se pudieron cargar los tipos.");
   setTypes(data.types??[]);setCaps(data.capabilities??{create:false,edit:false,delete:false});
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los tipos.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 function start(type?:MaterialType){
  setForm(type?{...type}:blank());setEditCode(type?.code??null);
  setError("");setOpen(true);
 }
 async function save(){
  if(busy)return;setBusy(true);setError("");setMessage("");
  try{
   const url=editCode?"/api/management/material-types/"+encodeURIComponent(editCode):"/api/management/material-types";
   const response=await fetch(url,{method:editCode?"PATCH":"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(form)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"No se pudo guardar el tipo.");
   setOpen(false);await load();setMessage(editCode?"Tipo actualizado.":"Tipo creado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 async function remove(){
  if(!editCode||busy||!caps.delete)return;
  if(!confirm("¿Eliminar este tipo? Solo se puede si ningún material lo utiliza."))return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/management/material-types/"+encodeURIComponent(editCode),{method:"DELETE"});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"No se pudo eliminar el tipo.");
   setOpen(false);await load();setMessage("Tipo eliminado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo eliminar.");}
  finally{setBusy(false);}
 }
 const shown=types.filter(type=>(type.name+" "+type.code+" "+(type.obtaining??"")).toLowerCase().includes(filter.toLowerCase()));
 return <main className="min-h-screen bg-zinc-950 px-4 py-7 text-zinc-100">
  <div className="mx-auto max-w-6xl">
   <div className="flex flex-wrap gap-4 text-sm text-cyan-300">
    <Link href="/management">← Volver a Gestión</Link>
    <Link href="/management/materials">Ver materiales</Link>
   </div>
   <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
    <div>
     <h1 className="text-3xl font-bold">Gestión de tipos de material</h1>
     <p className="mt-2 max-w-2xl text-sm text-zinc-400">
      Administra categorías como metal, madera o planta. Sus formas y reacciones son
      valores predeterminados al crear materiales de este tipo.
     </p>
    </div>
    {caps.create&&<button className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-zinc-950"
     onClick={()=>start()}>Crear tipo</button>}
   </div>
   {message&&<p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
   {error&&!open&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
   <input aria-label="Buscar tipo de material" placeholder="Buscar tipo de material…" value={filter}
    onChange={e=>setFilter(e.target.value)} className={field+" mt-6"}/>
   {loading?<p className="mt-5 text-zinc-400">Cargando tipos…</p>:
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     {shown.map(type=><article key={type.code} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between gap-2">
       <div><h2 className="text-lg font-semibold">{type.name}</h2>
        <p className="text-xs text-zinc-500">{type.code} · {type.active?"Disponible":"Inactivo"}</p>
       </div>
       {caps.edit&&<button onClick={()=>start(type)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-cyan-300">Editar</button>}
      </div>
      {type.obtaining&&<p className="mt-2 text-sm text-zinc-300">Obtención: {type.obtaining}</p>}
      {type.rawForm&&<p className="mt-2 text-xs text-zinc-400">En bruto: {type.rawForm}</p>}
      {type.marketForm&&<p className="mt-1 text-xs text-zinc-400">Comercial: {type.marketForm}</p>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-amber-200">
       {type.fireReaction&&<span>Fuego: {type.fireReaction}</span>}
       {type.lightningReaction&&<span>Rayo: {type.lightningReaction}</span>}
       {type.iceReaction&&<span>Hielo: {type.iceReaction}</span>}
      </div>
     </article>)}
     {shown.length===0&&<p className="text-sm text-zinc-400">No hay tipos que coincidan.</p>}
    </div>}
   <ManagementModal open={open} title={editCode?"Editar tipo de material":"Crear tipo de material"}
    onClose={()=>setOpen(false)} maxWidth="max-w-3xl">
    <div className="space-y-4">
     {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
     <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Nombre
       <input className={field} maxLength={100} value={form.name} onChange={e=>{
        const name=e.target.value;
        let code=form.code;
        if(!editCode){try{code=materialTypeCodeFromName(name);}catch{code="";}}
        setForm(v=>({...v,name,code}));
       }}/>
      </label>
      <label className="text-sm">Código estable
       <input readOnly className={field+" opacity-70"} value={form.code}
        aria-label="Código del tipo de material"/>
      </label>
      {fields.map(([key,label])=><label key={key} className="text-sm">{label}
       <input className={field} maxLength={700} value={form[key]??""}
        onChange={e=>setForm(v=>({...v,[key]:e.target.value||null}))}/>
      </label>)}
     </div>
     <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/>
      Disponible para nuevos materiales
     </label>
     <p className="text-xs text-zinc-500">El código no se modifica después de crear el tipo, para proteger los materiales asociados.</p>
     <div className="flex flex-wrap justify-between gap-3">
      <div>{editCode&&caps.delete&&<button disabled={busy} onClick={()=>void remove()}
       className="rounded-lg border border-red-500/50 px-4 py-2 text-red-300">Eliminar tipo</button>}</div>
      <div className="flex gap-2">
       <button onClick={()=>setOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2">Cancelar</button>
       <button disabled={busy} onClick={()=>void save()}
        className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">
        {busy?"Guardando…":"Guardar tipo"}</button>
      </div>
     </div>
    </div>
   </ManagementModal>
  </div>
 </main>;
}
