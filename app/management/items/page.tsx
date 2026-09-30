"use client";

import { useEffect, useState } from "react";

type Effect = { type: string; stat: string; action?: string; value: number; description: string };
type Item = {
  id: number; name: string; description: string | null; itemType: string;
  acquisitionType: string; price: number; effects: Effect[]; allowedSlots: string[];
};

const itemTypes = [
  ["WEAPON","Arma"],["ARMOR","Armadura"],["ACCESSORY","Accesorio"],
  ["CONSUMABLE","Consumible"],["MATERIAL","Material"],["OTHER","Otro"],
];
const acquisitionTypes = [
  ["PURCHASABLE","Comprable"],["CRAFTED","Fabricado"],["ABILITY_GENERATED","Generado por habilidad"],
  ["QUEST","Misión"],["EVENT","Evento"],["SYSTEM","Sistema"],["OTHER","Otro"],
];
const equipmentSlots = [
  ["MAIN_HAND","Mano principal"],["OFF_HAND","Mano secundaria"],["HEAD","Cabeza"],["BODY","Cuerpo"],
  ["FEET","Pies"],["ARMS","Brazos"],["BACK","Espalda"],["ACCESSORY_1","Accesorio 1"],["ACCESSORY_2","Accesorio 2"],
];

const EFFECT_TYPES = [
  ["stat_multiplier", "Estadística ×"],
  ["stat_bonus", "Estadística +"],
  ["system_action", "Acción del sistema"],
] as const;
const SYSTEM_ACTIONS = [["ESCAPE_MAZE", "Escapar del laberinto"]] as const;

const EFFECT_TARGETS = [
  ["STR", "Fuerza (STR)"], ["AGI", "Agilidad (AGI)"], ["CON", "Constitución (CON)"],
  ["INT", "Inteligencia (INT)"], ["WIS", "Sabiduría (WIS)"], ["CHA", "Carisma (CHA)"],
  ["SPI", "Espíritu (SPI)"], ["LCK", "Suerte (LCK)"],
  ["HP", "Vida (HP)"], ["MANA", "Maná"], ["PHYS_ATK", "Ataque físico"],
  ["MAGIC_ATK", "Ataque mágico"], ["DEF", "Defensa física"], ["MAG_DEF", "Defensa mágica"],
  ["PRECISION", "Precisión"], ["CRITICAL", "Crítico"], ["DISCOVERY", "Hallazgo"],
  ["MIRACLE", "Milagro"], ["INTIMIDATION", "Intimidación"], ["CONQUEST", "Conquista"],
  ["RACE", "Carrera"], ["DODGE", "Evasión"], ["STEALTH", "Sigilo"], ["DETECTION", "Detección"],
  ["ATTACK_TOTAL", "Ataque total"], ["DAMAGE_REDUCTION_ALL", "Reducción de daño total"],
] as const;

const emptyEffect = (): Effect => ({ type: "stat_multiplier", stat: "STR", action: "ESCAPE_MAZE", value: 100, description: "" });
const defaultSlots: string[] = [];
const noEffects = (effects: Effect[]) => !Array.isArray(effects) || effects.length === 0;

export default function ItemsManagementPage() {
  const [items,setItems]=useState<Item[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState({name:"",description:"",itemType:"OTHER",acquisitionType:"PURCHASABLE",price:0,effects:[emptyEffect()],allowedSlots:defaultSlots});
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const [search,setSearch]=useState(""); const [filterType,setFilterType]=useState("ALL"); const [filterSlot,setFilterSlot]=useState("ALL"); const [filterAcquisition,setFilterAcquisition]=useState("ALL");

  async function load(){
    setLoading(true); setError("");
    try { const r=await fetch("/api/management/items"); const d=await r.json(); if(!r.ok) throw new Error(d.error); setItems(d.items??[]); }
    catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los objetos.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const filteredItems = items.filter(item => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || String(item.description ?? "").toLowerCase().includes(q);
    const matchesType = filterType === "ALL" || item.itemType === filterType;
    const matchesSlot = filterSlot === "ALL" || (Array.isArray(item.allowedSlots) && item.allowedSlots.includes(filterSlot));
    const matchesAcquisition = filterAcquisition === "ALL" || item.acquisitionType === filterAcquisition;
    return matchesSearch && matchesType && matchesSlot && matchesAcquisition;
  });

  function edit(item: Item){
    setSelected(item.id);
    setForm({name:item.name,description:item.description??"",itemType:item.itemType,acquisitionType:item.acquisitionType,price:Number(item.price),effects:Array.isArray(item.effects)?item.effects.map((effect:any)=>({type:["stat_bonus","system_action"].includes(String(effect.type))?String(effect.type):"stat_multiplier",stat:EFFECT_TARGETS.some(x=>x[0]===String(effect.stat))?String(effect.stat):String(effect.stat)==="OTHER"&&String(effect.description??"").toLowerCase().includes("todos los ataques")?"ATTACK_TOTAL":"OTHER",action:String(effect.action??"ESCAPE_MAZE"),value:Number(effect.value),description:String(effect.description??"")})): [],allowedSlots:Array.isArray(item.allowedSlots)?item.allowedSlots:defaultSlots});
    setSuccess(""); setError("");
  }
  function newItem(){setSelected(null);setForm({name:"",description:"",itemType:"OTHER",acquisitionType:"PURCHASABLE",price:0,effects:[],allowedSlots:defaultSlots});setSuccess("");setError("");}
  function updateEffect(index:number,key:keyof Effect,value:string){
    setForm(f=>({...f,effects:f.effects.map((e,i)=>{
      if(i!==index) return e;
      if(key==="type") return value==="system_action" ? {...e,type:value,stat:"SYSTEM_ACTION",action:"ESCAPE_MAZE",value:1} : {...e,type:value,stat:e.stat==="SYSTEM_ACTION"?"STR":e.stat};
      if(key==="stat") return {...e,stat:value};
      return {...e,[key]:key==="value"?Number(value):value};
    })}));
  }
  async function save(){
    setSaving(true);setError("");setSuccess("");
    try{
      const url=selected?"/api/management/items/"+selected:"/api/management/items";
      const r=await fetch(url,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json(); if(!r.ok) throw new Error(d.error);
      setSuccess(selected?"Objeto actualizado correctamente.":"Objeto creado correctamente.");
      await load(); if(!selected&&d.item) setSelected(d.item.id); if(d.item) edit(d.item);
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
            <select value={filterSlot} onChange={e=>setFilterSlot(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm sm:col-span-2"><option value="ALL">Todos los slots</option>{equipmentSlots.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500"><span>{filteredItems.length} de {items.length} objetos</span><button type="button" onClick={()=>{setSearch("");setFilterType("ALL");setFilterSlot("ALL");setFilterAcquisition("ALL");}} className="text-zinc-300">Limpiar filtros</button></div>
          <div className="space-y-2">{filteredItems.map(item=><button key={item.id} onClick={()=>edit(item)} className={"w-full rounded-xl border p-4 text-left transition "+(selected===item.id?"border-amber-400/50 bg-amber-950/20":"border-zinc-800 hover:bg-zinc-900")}>
          <div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-zinc-500">{itemTypes.find(x=>x[0]===item.itemType)?.[1]??item.itemType} · {acquisitionTypes.find(x=>x[0]===item.acquisitionType)?.[1]??item.acquisitionType}</div>
        </button>)}</div></div>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">{selected?"Editar objeto":"Fabricar objeto"}</h2>
        <div className="mt-5 grid gap-4">
          <label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <label>Descripción<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>Tipo<select value={form.itemType} onChange={e=>setForm({...form,itemType:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{itemTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
            <label>Obtención<select value={form.acquisitionType} onChange={e=>setForm({...form,acquisitionType:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{acquisitionTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
            <label>Precio<input type="number" min={0} value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)||0})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          </div>
          <div><h3 className="font-medium">Slots de equipo</h3><p className="mt-1 text-xs text-zinc-500">{form.allowedSlots.length ? "El objeto solo podrá equiparse en los slots seleccionados." : "Este objeto no se equipa."}</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{equipmentSlots.map(([value,label])=><label key={value} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={form.allowedSlots.includes(value)} onChange={(e)=>setForm(f=>({...f,allowedSlots:e.target.checked?[...f.allowedSlots,value]:f.allowedSlots.filter(slot=>slot!==value)}))}/>{label}</label>)}</div></div>
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
    </div>
  </div></main>;
}