"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";
import {MATERIAL_TYPES,type MaterialDraft,type MaterialType} from "@/lib/items/materials";

type Material=MaterialDraft&{id:number;createdAt?:string};
type Capabilities={create:boolean;edit:boolean;delete:boolean};
const empty=():MaterialDraft=>({
 name:"",type:"WOOD",description:null,weightPerUnitKg:null,hardness:0,
 physicalResistance:0,magicResistance:0,attackGrant:0,defenseGrant:0,
 specialEffect:null,naturalForm:null,minimumForm:null,rawForm:null,
 marketForm:null,fireReaction:null,lightningReaction:null,iceReaction:null,active:true,
});
const textFields=[
 ["description","Descripción"],
 ["specialEffect","Efecto especial (descriptivo)"],
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
 ["attackGrant","Bono de ataque (referencia)"],
 ["defenseGrant","Bono de defensa (referencia)"],
] as const;
const fieldStyle="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
export default function MaterialsManagementPage(){
 const [materials,setMaterials]=useState<Material[]>([]);
 const [capabilities,setCapabilities]=useState<Capabilities>({create:false,edit:false,delete:false});
 const [filter,setFilter]=useState("");
 const [typeFilter,setTypeFilter]=useState("ALL");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [modal,setModal]=useState(false);
 const [selected,setSelected]=useState<number|null>(null);
 const [form,setForm]=useState<MaterialDraft>(empty);
 async function load(){
  setLoading(true);
  try{
   const response=await fetch("/api/management/materials",{cache:"no-store"});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"No se pudo consultar los materiales.");
   setMaterials(result.materials??[]);
   setCapabilities(result.capabilities??{create:false,edit:false,delete:false});
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar el catálogo.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 function newMaterial(){setSelected(null);setForm(empty());setError("");setModal(true);}
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
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"No se pudo guardar.");
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
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"No se pudo eliminar el material.");
   setModal(false);await load();setMessage("Material eliminado. Los objetos vinculados conservan su existencia.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo eliminar.");}
  finally{setSaving(false);}
 }
 const labelFor=(type:string)=>MATERIAL_TYPES.find(x=>x.value===type)?.label??type;
 const visible=materials.filter(m=>(typeFilter==="ALL"||m.type===typeFilter)&&
  (!filter||[m.name,m.description??"",m.specialEffect??"",labelFor(m.type)].join(" ").toLowerCase().includes(filter.toLowerCase())));
 return <main className="min-h-screen bg-zinc-950 text-zinc-100">
  <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
   <Link href="/management" className="text-sm text-cyan-300">← Volver a Gestión</Link>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="text-3xl font-bold">Gestión de materiales</h1>
     <p className="mt-2 max-w-2xl text-sm text-zinc-400">Catálogo de composiciones para armas, armaduras, consumibles y otros objetos.
      Sus resistencias y bonos se guardan como referencia: no alteran todavía las estadísticas del combate.</p></div>
    {capabilities.create&&<button onClick={newMaterial} className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-zinc-950">Crear material</button>}
   </div>
   {message&&<p role="status" className="mt-4 rounded-lg border border-emerald-500/30 p-3 text-sm text-emerald-300">{message}</p>}
   {error&&!modal&&<p role="alert" className="mt-4 rounded-lg border border-red-500/30 p-3 text-sm text-red-300">{error}</p>}
   <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">
    <input aria-label="Buscar material" placeholder="Buscar material…" value={filter} onChange={e=>setFilter(e.target.value)} className={fieldStyle}/>
    <select aria-label="Filtrar por tipo de material" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className={fieldStyle}>
     <option value="ALL">Todos los tipos</option>{MATERIAL_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
    </select>
   </div>
   <p className="mt-3 text-xs text-zinc-500">{visible.length} materiales de {materials.length}</p>
   {loading?<p className="mt-8 text-zinc-400">Consultando materiales…</p>:
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
       <span>Dureza: {material.hardness}/100</span>
       <span>Resistencia física: {material.physicalResistance}/100</span>
       <span>Resistencia mágica: {material.magicResistance}/100</span>
       <span>Ataque: {material.attackGrant>=0?"+":""}{material.attackGrant}</span>
       <span>Defensa: {material.defenseGrant>=0?"+":""}{material.defenseGrant}</span>
      </div>
      {material.specialEffect&&<p className="mt-3 text-xs text-amber-200">{material.specialEffect}</p>}
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
       <select value={form.type} onChange={e=>update("type",e.target.value as MaterialType)} className={fieldStyle}>
        {MATERIAL_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
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
        max={key==="attackGrant"||key==="defenseGrant"?10000:100} value={form[key]}
        onChange={e=>update(key,Number(e.target.value))} className={fieldStyle}/>
      </label>)}
     </div>
     <p className="text-xs text-zinc-500">Los bonos registrados no se suman a las armas hasta aprobar una fórmula de combinación y balance.</p>
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
