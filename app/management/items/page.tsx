"use client";

import { useEffect, useState } from "react";

type Effect = { type: string; stat: string; value: number; description: string };
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
  ["QUEST","Misión"],["EVENT","Evento"],["OTHER","Otro"],
];
const effectTypes = [
  ["stat_multiplier","× Estadística"],["stat_bonus","+ Estadística"],
];
const effectStats = [
  ["STR","Fuerza"],["AGI","Agilidad"],["CON","Constitución"],["INT","Inteligencia"],
  ["WIS","Sabiduría"],["CHA","Carisma"],["SPI","Espíritu"],["LCK","Suerte"],
  ["ATTACK_TOTAL","Ataque total"],["DAMAGE_REDUCTION_ALL","Reducción de daño recibido"],
];
const equipmentSlots = [
  ["MAIN_HAND","Mano principal"],["OFF_HAND","Mano secundaria"],["HEAD","Cabeza"],["BODY","Cuerpo"],
  ["FEET","Pies"],["ARMS","Brazos"],["BACK","Espalda"],["ACCESSORY_1","Accesorio 1"],["ACCESSORY_2","Accesorio 2"],
];

const emptyEffect = (): Effect => ({ type: "stat_multiplier", stat: "STR", value: 100, description: "" });
const defaultSlots = ["ACCESSORY"];
const noEffects = (effects: Effect[]) => !Array.isArray(effects) || effects.length === 0;

export default function ItemsManagementPage() {
  const [items,setItems]=useState<Item[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState({name:"",description:"",itemType:"OTHER",acquisitionType:"PURCHASABLE",price:0,effects:[emptyEffect()],allowedSlots:defaultSlots});
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");

  async function load(){
    setLoading(true); setError("");
    try { const r=await fetch("/api/management/items"); const d=await r.json(); if(!r.ok) throw new Error(d.error); setItems(d.items??[]); }
    catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los objetos.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  function edit(item: Item){
    setSelected(item.id);
    setForm({name:item.name,description:item.description??"",itemType:item.itemType,acquisitionType:item.acquisitionType,price:Number(item.price),effects:Array.isArray(item.effects)?item.effects.map((effect:any)=>({type:effect.type==="attack_multiplier_all"?"stat_multiplier":effect.type==="damage_reduction_all"?"stat_bonus":String(effect.type),stat:effect.stat??(effect.type==="attack_multiplier_all"?"ATTACK_TOTAL":effect.type==="damage_reduction_all"?"DAMAGE_REDUCTION_ALL":"STR"),value:Number(effect.value),description:String(effect.description??"")})): [],allowedSlots:Array.isArray(item.allowedSlots)&&item.allowedSlots.length?item.allowedSlots:defaultSlots});
    setSuccess(""); setError("");
  }
  function newItem(){setSelected(null);setForm({name:"",description:"",itemType:"OTHER",acquisitionType:"PURCHASABLE",price:0,effects:[],allowedSlots:defaultSlots});setSuccess("");setError("");}
  function updateEffect(index:number,key:keyof Effect,value:string){
    setForm(f=>({...f,effects:f.effects.map((e,i)=>i===index?{...e,[key]:key==="value"?Number(value):value}:e)}));
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
        <div className="mt-4 space-y-2">{items.map(item=><button key={item.id} onClick={()=>edit(item)} className={"w-full rounded-xl border p-4 text-left transition "+(selected===item.id?"border-amber-400/50 bg-amber-950/20":"border-zinc-800 hover:bg-zinc-900")}>
          <div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-zinc-500">{itemTypes.find(x=>x[0]===item.itemType)?.[1]??item.itemType} · {acquisitionTypes.find(x=>x[0]===item.acquisitionType)?.[1]??item.acquisitionType}</div>
        </button>)}</div>
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
          <div><h3 className="font-medium">Slots de equipo</h3><p className="mt-1 text-xs text-zinc-500">El objeto solo podrá equiparse en los slots seleccionados.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{equipmentSlots.map(([value,label])=><label key={value} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={form.allowedSlots.includes(value)} onChange={(e)=>setForm(f=>({...f,allowedSlots:e.target.checked?[...f.allowedSlots,value]:f.allowedSlots.filter(slot=>slot!==value)}))}/>{label}</label>)}</div></div>
          <div><div className="flex items-center justify-between"><h3 className="font-medium">Efectos</h3>{noEffects(form.effects)?<span className="text-sm text-zinc-500">Sin efectos</span>:<button type="button" onClick={()=>setForm(f=>({...f,effects:[...f.effects,emptyEffect()]}))} className="text-sm text-zinc-300">+ Añadir efecto</button>}</div>
          <div className="mt-3 space-y-3">{form.effects.map((effect,i)=><div key={i} className="rounded-xl border border-zinc-800 p-4">
            <div className="grid gap-3 sm:grid-cols-3"><select value={effect.type} onChange={e=>updateEffect(i,"type",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{effectTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <select value={effect.stat} onChange={e=>updateEffect(i,"stat",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{effectStats.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <input type="number" value={effect.value} onChange={e=>updateEffect(i,"value",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Valor"/></div>
            <input value={effect.description} onChange={e=>updateEffect(i,"description",e.target.value)} className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Descripción del efecto"/>
            <button type="button" onClick={() => setForm(f => ({ ...f, effects: f.effects.filter((_, j) => j !== i) }))} className="mt-2 text-sm text-red-300">Quitar efecto</button>
          </div>)}</div></div>
          <div className="flex flex-wrap gap-3"><button onClick={save} disabled={saving} className="rounded-lg bg-white px-5 py-3 font-medium text-black">{saving?"Guardando...":selected?"Guardar cambios":"Fabricar objeto"}</button>{selected&&<button onClick={remove} className="rounded-lg border border-red-900/70 px-5 py-3 text-red-300">Eliminar</button>}</div>
        </div>
      </section>
    </div>
  </div></main>;
}