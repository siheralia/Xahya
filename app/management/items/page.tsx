"use client";

import { useEffect, useState } from "react";
import ManagementModal from "../_components/ManagementModal";
import { EFFECT_CATALOG } from "@/lib/effects/catalog";

type Effect = { type: string; stat: string; action?: string; value: number; description: string };
type Item = {
  id: number; name: string; description: string | null; itemType: string; itemSubtype: string | null; attackType: string | null;
  acquisitionType: string; price: number; propertyBusinessId?: number | null; effects: Effect[]; allowedSlots: string[]; imagePath?: string | null; imageUrl?: string | null;
};

const itemTypes = [
  ["WEAPON","Arma"],["ARMOR","Armadura"],["ACCESSORY","Accesorio"],
  ["CONSUMABLE","Consumible"],["MATERIAL","Material"],["PROPERTY","Propiedad"],["OTHER","Otro"],
];
const acquisitionTypes = [
  ["PURCHASABLE","Comprable"],["CRAFTED","Fabricado"],["ABILITY_GENERATED","Generado por habilidad"],
  ["QUEST","Misión"],["EVENT","Evento"],["SYSTEM","Sistema"],["OTHER","Otro"],
];
const equipmentSlots = [
  ["MAIN_HAND","Mano principal"],["OFF_HAND","Mano secundaria"],["HEAD","Cabeza"],["BODY","Cuerpo"],
  ["FEET","Pies"],["ARMS","Brazos"],["BACK","Espalda"],["ACCESSORY_1","Accesorio 1"],["ACCESSORY_2","Accesorio 2"],
];

const EFFECT_TYPES = [...EFFECT_CATALOG.map(effect => [effect.type.toLowerCase(), effect.label] as const), ["system_action","Acción del sistema"]] as const;
const DAMAGE_TARGETS = [["ALL","Todo"],["PHYSICAL","Físico"],["MAGICAL","Mágico"]] as const;
const SYSTEM_ACTIONS = [["ESCAPE_MAZE", "Escapar del laberinto"], ["DISARM_MAZE_TRAP", "Romper una trampa y liberarte"], ["RELEASE_MAZE_TRAPPED", "Liberarte de una trampa"], ["CREATE_SKILL", "Permitir crear una habilidad"]] as const;

const EFFECT_TARGETS = [
  ["STR", "Fuerza (STR)"], ["AGI", "Agilidad (AGI)"], ["CON", "Constitución (CON)"],
  ["INT", "Inteligencia (INT)"], ["WIS", "Sabiduría (WIS)"], ["CHA", "Carisma (CHA)"],
  ["SPI", "Espíritu (SPI)"], ["LCK", "Suerte (LCK)"], ["HP", "Vida (HP)"], ["MANA", "Maná"],
  ["PHYS_ATK", "Ataque físico"], ["MAGIC_ATK", "Ataque mágico"], ["DEF", "Defensa física"],
  ["MAG_DEF", "Defensa mágica"], ["PRECISION", "Precisión"], ["CRITICAL", "Crítico"], ["DISCOVERY", "Hallazgo"],
  ["MIRACLE", "Milagro"], ["INTIMIDATION", "Intimidación"], ["CONQUEST", "Conquista"], ["RACE", "Carrera"],
  ["DODGE", "Evasión"], ["STEALTH", "Sigilo"], ["DETECTION", "Detección"], ["ATTACK_TOTAL", "Ataque total"],
  ["INVISIBILITY", "Invisibilidad"], ["FLOATING", "Flotar"], ["OTHER", "Otro"],
] as const;

const emptyEffect = (): Effect => ({ type: "stat_multiplier", stat: "STR", action: "ESCAPE_MAZE", value: 100, description: "" });
const defaultSlots: string[] = [];
const noEffects = (effects: Effect[]) => !Array.isArray(effects) || effects.length === 0;

export default function ItemsManagementPage() {
  const [items,setItems]=useState<Item[]>([]);
  const [businesses,setBusinesses]=useState<{id:number;name:string}[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState({name:"",description:"",itemType:"OTHER",itemSubtype:"",attackType:"CUT",acquisitionType:"PURCHASABLE",price:0,propertyBusinessId:"",effects:[emptyEffect()],allowedSlots:defaultSlots});
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const [modalOpen,setModalOpen]=useState(false); const [imageFile,setImageFile]=useState<File|null>(null); const [imagePreview,setImagePreview]=useState<string|null>(null);
  const [search,setSearch]=useState(""); const [filterType,setFilterType]=useState("ALL"); const [filterSubtype,setFilterSubtype]=useState("ALL"); const [filterSlot,setFilterSlot]=useState("ALL"); const [filterAcquisition,setFilterAcquisition]=useState("ALL"); const [filterStat,setFilterStat]=useState("ALL"); const [filterMinValue,setFilterMinValue]=useState("");

  async function load(){
    setLoading(true); setError("");
    try { const [itemsResponse,businessesResponse]=await Promise.all([fetch("/api/management/items"),fetch("/api/management/businesses")]); const d=await itemsResponse.json(); const bd=await businessesResponse.json(); if(!itemsResponse.ok) throw new Error(d.error); if(!businessesResponse.ok) throw new Error(bd.error); setItems(d.items??[]); setBusinesses((bd.businesses??[]).map((b:any)=>({id:Number(b.id),name:String(b.name)}))); }
    catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los objetos.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const subtypeOptions = Array.from(new Set(items.map(item => String(item.itemSubtype ?? "").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"es"));

  const filteredItems = items.filter(item => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || String(item.description ?? "").toLowerCase().includes(q);
    const matchesType = filterType === "ALL" || item.itemType === filterType;
    const matchesSubtype = filterSubtype === "ALL" || String(item.itemSubtype ?? "") === filterSubtype;
    const matchesSlot = filterSlot === "ALL" || (Array.isArray(item.allowedSlots) && item.allowedSlots.includes(filterSlot));
    const matchesStat = filterStat === "ALL" || item.effects.some(effect => String(effect.stat ?? "") === filterStat || (filterStat === "ATTACK_TOTAL" && effect.type === "attack_multiplier_all"));
    const minValue = filterMinValue === "" ? null : Number(filterMinValue);
    const matchesMinValue = minValue === null || filterStat === "ALL" || item.effects.some(effect => String(effect.stat ?? "") === filterStat && Number(effect.value) >= minValue);
    const matchesAcquisition = filterAcquisition === "ALL" || item.acquisitionType === filterAcquisition;
    return matchesSearch && matchesType && matchesSubtype && matchesSlot && matchesAcquisition && matchesStat && matchesMinValue;
  });

  function edit(item: Item){
    setSelected(item.id);
    setForm({name:item.name,description:item.description??"",itemType:item.itemType,itemSubtype:item.itemSubtype??"",attackType:item.attackType??"CUT",acquisitionType:item.acquisitionType,price:Number(item.price),propertyBusinessId:item.propertyBusinessId==null?"":String(item.propertyBusinessId),effects:Array.isArray(item.effects)?item.effects.map((effect:any)=>({type:["stat_bonus","system_action","ignore_phys_def_multiplier","ignore_phys_def_bonus","ignore_magic_def_multiplier","ignore_magic_def_bonus","ignore_all_def_multiplier","ignore_all_def_bonus","final_damage_multiplier","final_damage_bonus","maze_utility"].includes(String(effect.type))?String(effect.type):"stat_multiplier",stat:EFFECT_TARGETS.some(x=>x[0]===String(effect.stat))?String(effect.stat):String(effect.stat)==="OTHER"&&String(effect.description??"").toLowerCase().includes("todos los ataques")?"ATTACK_TOTAL":"OTHER",action:String(effect.action??"ESCAPE_MAZE"),value:Number(effect.value),description:String(effect.description??"")})): [],allowedSlots:Array.isArray(item.allowedSlots)?item.allowedSlots:defaultSlots});
    setSuccess(""); setError(""); setImageFile(null); setImagePreview(item.imageUrl ?? null);
    setModalOpen(true);
  }
  function newItem(){setSelected(null);setForm({name:"",description:"",itemType:"OTHER",itemSubtype:"",attackType:"CUT",acquisitionType:"PURCHASABLE",price:0,propertyBusinessId:"",effects:[],allowedSlots:defaultSlots});setSuccess("");setError("");setImageFile(null);setImagePreview(null);setModalOpen(true);}
  function updateEffect(index:number,key:keyof Effect,value:string){
    setForm(f=>({...f,effects:f.effects.map((e,i)=>{
      if(i!==index) return e;
      if(key==="type") return value==="system_action" ? {...e,type:value,stat:"SYSTEM_ACTION",action:"ESCAPE_MAZE",value:1} : value==="narrative" ? {...e,type:value,stat:"OTHER",value:1} : value==="maze_utility" ? {...e,type:value,stat:e.stat==="FLOATING"||e.stat==="INVISIBILITY"?e.stat:"INVISIBILITY",value:1} : value==="damage_reduction"||value==="damage_increase" ? {...e,type:value,stat:e.stat==="ALL"||e.stat==="PHYSICAL"||e.stat==="MAGICAL"?e.stat:"ALL",value:e.value||100} : {...e,type:value,stat:e.stat==="SYSTEM_ACTION"||e.stat==="OTHER"||e.stat==="INVISIBILITY"||e.stat==="FLOATING"?"STR":e.stat};
      if(key==="stat") return {...e,stat:value};
      return {...e,[key]:key==="value"?Number(value):value};
    })}));
  }
  async function save(){
    setSaving(true);setError("");setSuccess("");
    try{
      const url=selected?"/api/management/items/"+selected:"/api/management/items";
      const r=await fetch(url,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,attackType:form.itemType==="WEAPON"?form.attackType:null,propertyBusinessId:form.itemType==="PROPERTY"&&form.propertyBusinessId?Number(form.propertyBusinessId):null})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error);
      const savedId=Number(d?.item?.id ?? selected);
      if(imageFile && savedId){
        const fd=new FormData(); fd.set("itemId",String(savedId)); fd.set("file",imageFile);
        const imageResponse=await fetch("/api/management/items/image",{method:"POST",body:fd});
        const imageData=await imageResponse.json().catch(()=>null);
        if(!imageResponse.ok) throw new Error(imageData?.error ?? "El objeto se guardó, pero no se pudo subir la imagen.");
      }
      setSuccess(selected?"Objeto actualizado correctamente.":"Objeto creado correctamente.");
      await load(); if(savedId) setSelected(savedId); setModalOpen(false); setImageFile(null);
    }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el objeto.");}finally{setSaving(false);}
  }
  async function remove(){
    if(!selected||!confirm("¿Eliminar este objeto del catálogo?")) return;
    const r=await fetch("/api/management/items/"+selected,{method:"DELETE"}); const d=await r.json();
    if(!r.ok){setError(d.error??"No se pudo eliminar.");return;} newItem(); await load(); setSuccess("Objeto eliminado.");
  }

  if(loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando objetos...</p></main>;

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-4xl font-bold">Objetos</h1><p className="mt-2 text-zinc-500">Catálogo y fabricación de objetos. Solo ADMIN.</p></div>
      <button onClick={newItem} className="rounded-lg bg-white px-5 py-3 font-medium text-black">Nuevo objeto</button>
    </div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}
    <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Catálogo</h2>
        <div className="mt-4 space-y-3">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o descripción..." className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="ALL">Todos los tipos</option>{itemTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <select value={filterAcquisition} onChange={e=>setFilterAcquisition(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="ALL">Toda obtención</option>{acquisitionTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <select value={filterSubtype} onChange={e=>setFilterSubtype(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="ALL">Todos los tipos específicos</option>{subtypeOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
            <select value={filterStat} onChange={e=>setFilterStat(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="ALL">Todas las estadísticas</option>{EFFECT_TARGETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
            <input type="number" value={filterMinValue} onChange={e=>setFilterMinValue(e.target.value)} placeholder="Valor mínimo" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/>
            <select value={filterSlot} onChange={e=>setFilterSlot(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm sm:col-span-2"><option value="ALL">Todos los slots</option>{equipmentSlots.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>{filteredItems.length} de {items.length} objetos</span><button type="button" onClick={()=>{setSearch("");setFilterType("ALL");setFilterSubtype("ALL");setFilterSlot("ALL");setFilterAcquisition("ALL");setFilterStat("ALL");setFilterMinValue("");}} className="text-zinc-300">Limpiar filtros</button></div>
          <div className="space-y-2">{filteredItems.map(item=><button key={item.id} onClick={()=>edit(item)} className={"w-full rounded-xl border p-4 text-left transition "+(selected===item.id?"border-amber-400/50 bg-amber-950/20":"border-zinc-800 hover:bg-zinc-900")}>
          <div className="flex items-center gap-3">{item.imageUrl&&<img src={item.imageUrl} alt="" className="h-12 w-16 rounded-lg object-cover"/>}<div><div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-zinc-500">{itemTypes.find(x=>x[0]===item.itemType)?.[1]??item.itemType}{item.itemSubtype ? " · " + item.itemSubtype : ""} · {acquisitionTypes.find(x=>x[0]===item.acquisitionType)?.[1]??item.acquisitionType}</div></div></div>
        </button>)}</div></div>
      </section>
      <ManagementModal open={modalOpen} title={selected?"Editar objeto":"Nuevo objeto"} onClose={()=>setModalOpen(false)} maxWidth="max-w-4xl">
<section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">{selected?"Editar objeto":"Fabricar objeto"}</h2>
        <div className="mt-5 grid gap-4">
          <label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label>Descripción<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex flex-wrap items-center gap-4">
              {imagePreview ? <img src={imagePreview} alt={form.name || "Propiedad"} className="h-32 w-48 rounded-xl border border-zinc-700 object-cover" /> : <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-600">Sin imagen</div>}
              <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                {form.itemType === "PROPERTY" ? "Subir imagen de propiedad" : "Subir imagen"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e=>{const f=e.target.files?.[0] ?? null; setImageFile(f); if(f) setImagePreview(URL.createObjectURL(f)); e.currentTarget.value="";}} />
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-600">Máximo 5 MB. Las propiedades pueden tener una imagen propia.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>Tipo de categoría<select value={form.itemType} onChange={e=>setForm({...form,itemType:e.target.value,acquisitionType:e.target.value==="PROPERTY"?"OTHER":form.acquisitionType})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{itemTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
            <label>Negocio exclusivo (solo para propiedades)<select value={form.propertyBusinessId} disabled={form.itemType!=="PROPERTY"} onChange={e=>setForm({...form,propertyBusinessId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Ninguno — propiedad vendible por cualquier negocio</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>{form.itemType==="PROPERTY"&&<p className="mt-1 text-xs text-zinc-500">Si eliges un negocio, esta propiedad solo podrá ser comprada por ese negocio para revenderla.</p>}</label>
            <label>Tipo de ataque físico<select value={form.attackType} disabled={form.itemType!=="WEAPON"} onChange={e=>setForm({...form,attackType:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="CUT">Corte</option><option value="BLUNT">Contundente</option><option value="PIERCE">Penetración</option></select></label>
            <label>Tipo específico<input list="item-subtype-options" value={form.itemSubtype} onChange={e=>setForm({...form,itemSubtype:e.target.value})} placeholder="Ej. Espada, Lanza..." className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/><datalist id="item-subtype-options">{["Espada","Lanza","Daga","Arco","Ballesta","Bastón","Vara","Hacha","Martillo","Escudo","Casco","Armadura","Botas","Guantes","Anillo","Collar","Consumible","Material","Otro"].map(value=><option key={value} value={value}/>)}</datalist></label>
            <label>Obtención<select value={form.acquisitionType} onChange={e=>setForm({...form,acquisitionType:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{acquisitionTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
            <label>Precio<input type="number" min={0} value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)||0})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          </div>
          {form.itemType !== "PROPERTY" && <div><h3 className="font-medium">Slots de equipo</h3><p className="mt-1 text-xs text-zinc-500">{form.allowedSlots.length ? "El objeto solo podrá equiparse en los slots seleccionados." : "Este objeto no se equipa."}</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{equipmentSlots.map(([value,label])=><label key={value} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={form.allowedSlots.includes(value)} onChange={(e)=>setForm(f=>({...f,allowedSlots:e.target.checked?[...f.allowedSlots,value]:f.allowedSlots.filter(slot=>slot!==value)}))}/>{label}</label>)}</div></div>}
          <div><div className="flex items-center justify-between"><h3 className="font-medium">Efectos</h3><div className="flex items-center gap-3">{noEffects(form.effects)&&<span className="text-sm text-zinc-500">Sin efectos</span>}<button type="button" onClick={()=>setForm(f=>({...f,effects:[...f.effects,emptyEffect()]}))} className="text-sm text-zinc-300">+ Añadir efecto</button></div></div>
          <div className="mt-3 space-y-3">{form.effects.map((effect,i)=><div key={i} className="rounded-xl border border-zinc-800 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <select value={effect.type} onChange={e=>updateEffect(i,"type",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                {EFFECT_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
              {effect.type === "system_action" ? (
                <select value={effect.action ?? "ESCAPE_MAZE"} onChange={e=>updateEffect(i,"action",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                  {SYSTEM_ACTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              ) : effect.type === "narrative" ? (
                <select value="OTHER" disabled className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-400"><option value="OTHER">Otro</option></select>
              ) : effect.type === "damage_reduction" || effect.type === "damage_increase" ? (
                <select value={effect.stat} onChange={e=>updateEffect(i,"stat",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                  {DAMAGE_TARGETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              ) : effect.stat === "OTHER" ? (
                <input value={effect.stat} onChange={e=>updateEffect(i,"stat",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Objetivo personalizado"/>
              ) : (
                <select value={effect.stat} onChange={e=>updateEffect(i,"stat",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                  {EFFECT_TARGETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                  <option value="OTHER">Otro</option>
                </select>
              )}
              {effect.type === "system_action" ? (
                <input type="number" value={1} readOnly className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-500"/>
              ) : (
                <input type="number" value={effect.value} onChange={e=>updateEffect(i,"value",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Valor"/>
              )}
            </div>
            <input value={effect.description} onChange={e=>updateEffect(i,"description",e.target.value)} className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Descripción del efecto"/>
            <button type="button" onClick={() => setForm(f => ({ ...f, effects: f.effects.filter((_, j) => j !== i) }))} className="mt-2 text-sm text-red-300">Quitar efecto</button>
          </div>)}</div></div>
          <div className="flex flex-wrap gap-3"><button onClick={save} disabled={saving} className="rounded-lg bg-white px-5 py-3 font-medium text-black">{saving?"Guardando...":selected?"Guardar cambios":"Fabricar objeto"}</button>{selected&&<button onClick={remove} className="rounded-lg border border-red-900/70 px-5 py-3 text-red-300">Eliminar</button>}</div>
        </div>
      </section>
      </ManagementModal>
    </div>
  </div></main>;
}