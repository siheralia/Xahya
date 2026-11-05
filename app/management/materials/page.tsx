"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";
import {type MaterialDraft} from "@/lib/items/materials";
import type {MaterialTypeRow} from "@/lib/items/material-types";
import {parseCatalogResponse} from "@/lib/items/catalog-response";

type Material=MaterialDraft&{id:number;createdAt?:string};
type Capabilities={create:boolean;edit:boolean;delete:boolean};
const empty=():MaterialDraft=>({
 name:"",type:"WOOD",description:null,weightPerUnitKg:null,hardness:0,
 bonusAgainstPerkId:null,bonusAgainstPerkAttack:0,
 physicalResistance:0,magicResistance:0,attackGrant:0,defenseGrant:0,
 specialEffect:null,naturalForm:null,minimumForm:null,rawForm:null,
 marketForm:null,fireReaction:null,lightningReaction:null,iceReaction:null,active:true,
});
const textFields=[
 ["description","Descripción"],
 ["specialEffect","Notas adicionales (sin efecto mecánico)"],
 ["naturalForm","Forma natural"],
 ["minimumForm","Forma mínima"],
 ["rawForm","Forma en bruto"],
 ["marketForm","Forma comercial"],
 ["fireReaction","Reacción al fuego"],
 ["lightningReaction","Reacción a los rayos"],
 ["iceReaction","Reacción al hielo"],
] as const;
const numbers=[
 ["hardness","Dureza"],
 ["physicalResistance","Resistencia física"],
 ["magicResistance","Resistencia mágica"],
 ["attackGrant","Bono de ataque general (pendiente de fórmula)"],
 ["defenseGrant","Bono de defensa general (pendiente de fórmula)"],
] as const;
const fieldStyle="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
export default function MaterialsManagementPage(){
 const [materials,setMaterials]=useState<Material[]>([]);
 const [types,setTypes]=useState<MaterialTypeRow[]>([]);
 const [perks,setPerks]=useState<{id:number;name:string}[]>([]);
 const [capabilities,setCapabilities]=useState<Capabilities>({create:false,edit:false,delete:false});
 const [filter,setFilter]=useState("");
 const [typeFilter,setTypeFilter]=useState("ALL");
 const [loading,setLoading]=useState(true);
 const [loadFailed,setLoadFailed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [modal,setModal]=useState(false);
 const [selected,setSelected]=useState<number|null>(null);
 const [form,setForm]=useState<MaterialDraft>(empty);
 async function load(){
  setLoading(true);setLoadFailed(false);
  try{
   const response=await fetch("/api/management/materials",{cache:"no-store"});
   const result=await parseCatalogResponse<{materials:Material[];types:MaterialTypeRow[];
    perks:{id:number;name:string}[];capabilities:Capabilities}>(response,"los materiales");
   if(!Array.isArray(result.materials)||!Array.isArray(result.types)||!Array.isArray(result.perks))
    throw new Error("El catálogo de materiales devolvió datos incompletos.");
   setMaterials(result.materials);setTypes(result.types);setPerks(result.perks);
   setCapabilities(result.capabilities??{create:false,edit:false,delete:false});
   setError("");
  }catch(e){
   setLoadFailed(true);
   setError(e instanceof Error?e.message:"No se pudo consultar el catálogo.");
  }
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 function newMaterial(){
  const first=types.find(t=>t.active);
  const defaults=first?{
   type:first.code,naturalForm:first.naturalForm,minimumForm:first.minimumForm,
   rawForm:first.rawForm,marketForm:first.marketForm,
   fireReaction:first.fireReaction,lightningReaction:first.lightningReaction,iceReaction:first.iceReaction
  }:{};
  setSelected(null);setForm({...empty(),...defaults});setError("");setModal(true);
 }
 function editMaterial(material:Material){
  setSelected(material.id);setForm({...empty(),...material});setError("");setModal(true);
 }
 function update<K extends keyof MaterialDraft>(key:K,value:MaterialDraft[K]){
  setForm(previous=>({...previous,[key]:value}));
 }
 async function save(){
  if(saving)return;
  setSaving(true);setError("");setMessage("");
  try{
   const url=selected?"/api/management/materials/"+selected:"/api/management/materials";
   const response=await fetch(url,{method:selected?"PATCH":"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
   await parseCatalogResponse(response,"el material");
   setModal(false);await load();setMessage(selected?"Material actualizado.":"Material creado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setSaving(false);}
 }
 async function remove(){
  if(!selected||!capabilities.delete)return;
  if(!confirm("¿Eliminar este material? Los objetos que lo usen quedarán «Sin definir», sin eliminar sus inventarios."))return;
  setSaving(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/management/materials/"+selected,{method:"DELETE"});
   await parseCatalogResponse(response,"el material");
   setModal(false);await load();setMessage("Material eliminado. Los objetos vinculados conservan su existencia.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo eliminar.");}
  finally{setSaving(false);}
 }
 const labelFor=(type:string)=>types.find(x=>x.code===type)?.name??type;
 const visible=materials.filter(m=>(typeFilter==="ALL"||m.type===typeFilter)&&
  (!filter||[m.name,m.description??"",m.specialEffect??"",labelFor(m.type)].join(" ").toLowerCase().includes(filter.toLowerCase())));
 return <main className="min-h-screen bg-zinc-950 text-zinc-100">
  <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
   <Link href="/management" className="text-sm text-cyan-300">← Volver a Gestión</Link>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-3xl font-bold">Gestión de materiales</h1>
     <p className="mt-2 max-w-2xl text-sm text-zinc-400">Catálogo de composiciones para armas, armaduras, consumibles y otros objetos.
      La dureza y las resistencias son escalables: acero = 100 como referencia, no como límite.
      La resistencia física reduce o aumenta el desgaste del arma al bloquear.
      El bono contra una perk se aplica a los ataques físicos con armas fabricadas con ese material.</p></div>
    {capabilities.create&&<button onClick={newMaterial} className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-zinc-950">Crear material</button>}
   </div>
   <Link href="/management/material-types" className="mt-3 inline-block text-sm text-cyan-300 underline underline-offset-4">
    Gestionar tipos de material
   </Link>
   {message&&<p role="status" className="mt-4 rounded-lg border border-emerald-500/30 p-3 text-sm text-emerald-300">{message}</p>}
   {error&&!modal&&<p role="alert" className="mt-4 rounded-lg border border-red-500/30 p-3 text-sm text-red-300">{error}</p>}
   <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">
    <input aria-label="Buscar material" placeholder="Buscar material…" value={filter} onChange={e=>setFilter(e.target.value)} className={fieldStyle}/>
    <select aria-label="Filtrar por tipo de material" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className={fieldStyle}>
     <option value="ALL">Todos los tipos</option>{types.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}
    </select>
   </div>
   {!loading&&!loadFailed&&<p className="mt-3 text-xs text-zinc-500">{visible.length} materiales de {materials.length}</p>}
   {loading?<p className="mt-8 text-zinc-400">Consultando materiales…</p>:
    loadFailed?<button type="button" onClick={()=>void load()}
     className="mt-4 rounded-lg border border-cyan-500/50 px-4 py-2 text-cyan-300">Volver a intentar</button>:
    <div className="mt-4 grid gap-3 md:grid-cols-2">
     {visible.map(material=><article key={material.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
       <div><h2 className="font-semibold">{material.name}</h2>
        <p className="mt-1 text-xs text-zinc-400">{labelFor(material.type)} · {material.active?"Disponible":"Inactivo"} · {material.weightPerUnitKg??"Sin definir"} kg/unidad</p>
       </div>
       {capabilities.edit&&<button onClick={()=>editMaterial(material)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-cyan-300">Editar</button>}
      </div>
      {material.description&&<p className="mt-3 text-sm text-zinc-300">{material.description}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
       <span>Dureza: {material.hardness}</span>
       <span>Resistencia física: {material.physicalResistance}</span>
       <span>Resistencia mágica: {material.magicResistance}</span>
       <span>Ataque: {material.attackGrant>=0?"+":""}{material.attackGrant}</span>
       <span>Defensa: {material.defenseGrant>=0?"+":""}{material.defenseGrant}</span>
      </div>
      {material.bonusAgainstPerkId!=null&&material.bonusAgainstPerkAttack>0&&
       <p className="mt-3 text-xs text-emerald-300">
        Ataque +{material.bonusAgainstPerkAttack} contra portadores de {perks.find(p=>p.id===Number(material.bonusAgainstPerkId))?.name??"la perk seleccionada"}
       </p>}
      {material.specialEffect&&<p className="mt-3 text-xs text-zinc-400">{material.specialEffect}</p>}
      {material.marketForm&&<p className="mt-2 text-xs text-zinc-500">Forma comercial: {material.marketForm}</p>}
     </article>)}
     {visible.length===0&&<p className="text-zinc-500">No hay materiales con estos filtros.</p>}
    </div>}
   <ManagementModal open={modal} title={selected?"Editar material":"Crear material"} onClose={()=>setModal(false)} maxWidth="max-w-3xl">
    <div className="space-y-4">
     {error&&<p role="alert" className="rounded-lg border border-red-600/30 p-3 text-sm text-red-300">{error}</p>}
     <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Nombre
       <input value={form.name} maxLength={100} onChange={e=>update("name",e.target.value)} className={fieldStyle}/>
      </label>
      <label className="text-sm">Tipo
       <select value={form.type} onChange={e=>{
        const found=types.find(t=>t.code===e.target.value);
        if(!found)return;
        setForm(old=>({...old,type:found.code,
         ...(selected?{}:{naturalForm:found.naturalForm,minimumForm:found.minimumForm,
          rawForm:found.rawForm,marketForm:found.marketForm,
          fireReaction:found.fireReaction,lightningReaction:found.lightningReaction,iceReaction:found.iceReaction})}));
       }} className={fieldStyle}>
        {types.filter(t=>t.active||t.code===form.type).map(t=>
         <option key={t.code} value={t.code}>{t.name}{t.active?"":" (inactivo)"}</option>)}
       </select>
      </label>
      <label className="text-sm">Peso por unidad (kg, opcional)
       <input type="number" min="0.001" max="100000" step="0.001" value={form.weightPerUnitKg??""}
        onChange={e=>update("weightPerUnitKg",e.target.value===""?null:Number(e.target.value))}
        placeholder="Sin definir" className={fieldStyle}/>
      </label>
      <label className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={form.active} onChange={e=>update("active",e.target.checked)}/>Disponible para nuevos objetos
      </label>
      {numbers.map(([key,label])=><label key={key} className="text-sm">{label}
       <input type="number" step="1" min={key==="attackGrant"||key==="defenseGrant"?-10000:0}
        max={key==="attackGrant"||key==="defenseGrant"?10000:1000000} value={form[key]}
        onChange={e=>update(key,Number(e.target.value))} className={fieldStyle}/>
      </label>)}
     </div>
     <p className="text-xs text-zinc-500">Resistencias y dureza: acero 100 de referencia, sin tope de balance; máximo técnico de seguridad 1.000.000. El bono general de ataque/defensa no se suma aún.</p>
     <div className="grid gap-3 sm:grid-cols-2 rounded-lg border border-emerald-500/20 p-3">
      <label className="text-sm">Bono contra portadores de una perk
       <select className={fieldStyle} value={form.bonusAgainstPerkId??""} onChange={e=>{
        const id=e.target.value?Number(e.target.value):null;
        setForm(v=>({...v,bonusAgainstPerkId:id,bonusAgainstPerkAttack:id?v.bonusAgainstPerkAttack:0}));
       }}>
        <option value="">Ninguna (sin bono)</option>
        {perks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
       </select>
      </label>
      <label className="text-sm">Ataque adicional del arma contra esa perk
       <input type="number" className={fieldStyle} step="1" min={0} max={10000}
        value={form.bonusAgainstPerkAttack}
        onChange={e=>update("bonusAgainstPerkAttack",Number(e.target.value))}/>
      </label>
      <p className="text-xs text-zinc-400 sm:col-span-2">
       Se evalúa contra las perks del objetivo en el momento del golpe, sin importar su raza.
       Solo se aplica cuando el arma equipada está hecha de este material, nunca con golpes desarmados o magia.
      </p>
     </div>
     <div className="grid gap-3 sm:grid-cols-2">
      {textFields.map(([key,label])=><label key={key} className={"text-sm "+(key==="description"?"sm:col-span-2":"")}>{label}
       <input maxLength={700} value={form[key]??""} onChange={e=>update(key,e.target.value||null)} className={fieldStyle}/>
      </label>)}
     </div>
     <div className="flex flex-wrap justify-between gap-3 pt-3">
      <div>{selected&&capabilities.delete&&<button type="button" onClick={()=>void remove()} disabled={saving}
       className="rounded-lg border border-red-500/50 px-4 py-2 text-red-300 disabled:opacity-40">Eliminar</button>}</div>
      <div className="flex gap-2">
       <button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-zinc-700 px-4 py-2">Cancelar</button>
       <button type="button" onClick={()=>void save()} disabled={saving}
        className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">
        {saving?"Guardando…":"Guardar material"}</button>
      </div>
     </div>
    </div>
   </ManagementModal>
  </div>
 </main>;
}
