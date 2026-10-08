"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";
import { EFFECT_CATALOG, EFFECT_TARGETS, type SkillEffectType } from "@/lib/effects/catalog";

type Perk={id:number;name:string;description:string|null;probability:number;effects:any[];stackable:boolean;maxStacks:number|null;active:boolean;assignedCount:number};
type Character={id:number;name:string;ownerName:string};

export default function PerksManagementPage(){
  const [perks,setPerks]=useState<Perk[]>([]);
  const [characters,setCharacters]=useState<Character[]>([]);
  const [characterId,setCharacterId]=useState("");
  const [perkId,setPerkId]=useState("");
  const [editingId,setEditingId]=useState<number|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [probability,setProbability]=useState("10");
  type EffectType=SkillEffectType;
  type Effect={type:EffectType;target?:string;value:number};
  const [effectRows,setEffectRows]=useState<Effect[]>([]);
  const EFFECT_TYPES = EFFECT_CATALOG.map(effect => [effect.type,effect.label] as [EffectType,string]);
  const TARGETS = EFFECT_TARGETS;
  const TARGET_LABELS: Record<string, string> = {
    STR: "Fuerza", AGI: "Agilidad", CON: "Constitución", INT: "Inteligencia",
    WIS: "Sabiduría", CHA: "Carisma", SPI: "Espíritu", LCK: "Suerte",
    HP: "Vida", MANA: "Maná", PHYS_ATK: "Ataque físico", MAGIC_ATK: "Ataque mágico",
    DEF: "Defensa física", MAG_DEF: "Defensa mágica", PRECISION: "Precisión",
    CRITICAL: "Crítico", DISCOVERY: "Descubrimiento", MIRACLE: "Milagro",
    INTIMIDATION: "Intimidación", CONQUEST: "Conquista", RACE: "Raza",
    DODGE: "Esquiva", STEALTH: "Sigilo", DETECTION: "Detección", ATTACK_TOTAL: "Ataque total",
    DAMAGE_REDUCTION_ALL: "Daño recibido reducido — todo",
    DAMAGE_REDUCTION_PHYSICAL: "Daño recibido reducido — físico",
    DAMAGE_REDUCTION_MAGICAL: "Daño recibido reducido — mágico",
    DAMAGE_INCREASE_ALL: "Daño recibido aumentado — todo",
    DAMAGE_INCREASE_PHYSICAL: "Daño recibido aumentado — físico",
    DAMAGE_INCREASE_MAGICAL: "Daño recibido aumentado — mágico",
    MONEY: "Dinero", KARMA: "Karma", LEVEL_UP_POINTS: "Puntos de subida",
    OTHER: "Otro", INVISIBILITY: "Invisibilidad", FLOATING: "Flotar",
  };
  const [effects,setEffects]=useState("");
  const [stackable,setStackable]=useState(true);
  const [maxStacks,setMaxStacks]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [modalOpen,setModalOpen]=useState(false);

  async function load(){
    const [p,c]=await Promise.all([fetch("/api/management/perks"),fetch("/api/management/characters")]);
    const pd=await p.json(); const cd=await c.json();
    if(!p.ok) throw new Error(pd?.error??"No se pudieron cargar los perks.");
    setPerks(pd.perks??[]);
    setCharacters(cd.characters??[]);
  }
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar."));},[]);

  function clearForm(){
    setEditingId(null);setName("");setDescription("");setProbability("10");setEffectRows([]);setEffects("");setStackable(true);setMaxStacks("");
    setModalOpen(false);
  }

  function edit(perk:Perk){
    setEditingId(perk.id);
    setName(perk.name);
    setDescription(perk.description??"");
    setProbability(String(perk.probability));
    setEffectRows((Array.isArray(perk.effects)?perk.effects:[]).map((effect:any)=>({type:(EFFECT_TYPES.some(([value])=>value===effect?.type)?effect.type:"STAT_BONUS") as EffectType,target:String(effect?.target??"STR"),value:Number(effect?.value??0)})));
    setStackable(perk.stackable);
    setMaxStacks(perk.maxStacks==null?"":String(perk.maxStacks));
    setError("");setSuccess("");
    setModalOpen(true);
  }

  async function savePerk(){
    setError("");setSuccess("");
    if(!name.trim()){setError("El perk necesita un nombre.");return;}
    const parsed=effectRows.filter(effect=>EFFECT_TYPES.some(([type])=>type===effect.type)&&(TARGETS[effect.type]?.length===0||TARGETS[effect.type]?.some(target=>target===effect.target))).map(effect=>({type:effect.type,target:effect.target,value:Number(effect.value)}));
    if(parsed.some(effect=>!Number.isFinite(effect.value))){setError("Todos los valores de los efectos deben ser números.");return;}
    const payload={name:name.trim(),description,effects:parsed,probability:Number(probability),stackable,maxStacks:stackable?null:(maxStacks===""?null:Number(maxStacks))};
    if(!Number.isFinite(payload.probability)||payload.probability<0){setError("Probabilidad inválida.");return;}
    if(!stackable&&maxStacks!==""&&(!Number.isFinite(Number(maxStacks))||Number(maxStacks)<1)){setError("El máximo de acumulaciones debe ser al menos 1.");return;}

    const url=editingId?"/api/management/perks/"+editingId:"/api/management/perks";
    const r=await fetch(url,{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok){setError(d?.error??(editingId?"No se pudo guardar.":"No se pudo crear."));return;}
    setSuccess(editingId?"Perk actualizado.":"Perk creado.");
    clearForm();
    await load();
  }

  async function updateProbability(perk:Perk,value:string){
    const probability=Number(value);
    if(!Number.isFinite(probability)||probability<0)return;
    const r=await fetch("/api/management/perks/"+perk.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({probability})});
    if(r.ok) await load();
  }

  async function toggle(perk:Perk){
    const r=await fetch("/api/management/perks/"+perk.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!perk.active})});
    if(r.ok) await load();
  }

  async function grant(){
    setError("");setSuccess("");
    if(!characterId||!perkId){setError("Selecciona personaje y perk.");return;}
    const r=await fetch("/api/management/perks/grant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),perkId:Number(perkId)})});
    const d=await r.json();if(!r.ok){setError(d?.error??"No se pudo otorgar.");return;}
    setSuccess("Perk otorgado correctamente.");
    await load();
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/management" className="text-sm text-zinc-500">← Gestión</Link><h1 className="mt-3 text-4xl font-bold">Gestión de Perks</h1><p className="mt-2 text-zinc-500">Probabilidades, acumulación, edición y entrega manual.</p></div><button onClick={()=>{clearForm();setModalOpen(true);}} className="rounded-lg bg-white px-5 py-3 font-medium text-black">Nuevo perk</button></div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Otorgar perk</h2>
        <div className="mt-4 grid gap-3">
          <select value={characterId} onChange={e=>setCharacterId(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name} — {c.ownerName}</option>)}</select>
          <select value={perkId} onChange={e=>setPerkId(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="">Perk</option>{perks.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={grant} className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 font-semibold text-cyan-300">Otorgar</button>
        </div>
    </section>
    <ManagementModal open={modalOpen} title={editingId?"Editar perk":"Nuevo perk"} onClose={()=>setModalOpen(false)} maxWidth="max-w-3xl">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{editingId?"Editar perk":"Crear perk"}</h2>{editingId&&<p className="mt-1 text-xs text-cyan-300">Editando #{editingId}</p>}</div>{editingId&&<button onClick={clearForm} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">Cancelar</button>}</div>
        <div className="mt-4 grid gap-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>
          <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>
          <label className="text-sm text-zinc-400">Probabilidad<input type="number" min="0" step="0.1" value={probability} onChange={e=>setProbability(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/></label>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-white">Efectos</div><div className="text-xs text-zinc-500">Configúralos con selectores, sin escribir JSON.</div></div><button type="button" onClick={()=>setEffectRows(rows=>[...rows,{type:"STAT_BONUS",target:"STR",value:0}])} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">+ Añadir efecto</button></div>
            <div className="mt-3 space-y-3">{effectRows.map((effect,index)=>{const targets=TARGETS[effect.type]??[];return <div key={index} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 md:grid-cols-[1fr_1fr_120px_auto]"><select value={effect.type} onChange={e=>{const type=e.target.value as EffectType;setEffectRows(rows=>rows.map((row,i)=>i===index?{...row,type,target:TARGETS[type]?.[0]??undefined}:row));}} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">{EFFECT_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select value={targets.length?(targets.includes(effect.target??"")?effect.target:targets[0]):undefined} onChange={e=>setEffectRows(rows=>rows.map((row,i)=>i===index?{...row,target:e.target.value}:row))} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                      {targets.map(target=><option key={target} value={target}>{TARGET_LABELS[target]??target}</option>)}
                    </select><input type="number" step="0.1" value={effect.value} onChange={e=>setEffectRows(rows=>rows.map((row,i)=>i===index?{...row,value:Number(e.target.value)}:row))} placeholder="Valor" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/><button type="button" onClick={()=>setEffectRows(rows=>rows.filter((_,i)=>i!==index))} className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300">Quitar</button></div>})}{!effectRows.length&&<p className="text-sm text-zinc-600">Sin efectos.</p>}</div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stackable} onChange={e=>setStackable(e.target.checked)}/> Acumulable</label>
          {!stackable&&<input type="number" min="1" value={maxStacks} onChange={e=>setMaxStacks(e.target.value)} placeholder="Máximo de acumulaciones" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3"/>}
          <button onClick={savePerk} className="rounded-lg bg-white px-4 py-3 font-semibold text-black">{editingId?"Guardar cambios":"Crear perk"}</button>
        </div>
      </div>


    </ManagementModal>

    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="text-xl font-semibold">Catálogo</h2><div className="mt-4 space-y-3">{perks.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><div className="min-w-0"><div className="font-semibold">{p.name} <span className="ml-2 text-xs text-zinc-500">{p.probability}%</span></div><p className="mt-1 text-sm text-zinc-500">{p.description??"Sin descripción."}</p><p className="mt-1 text-xs text-zinc-600">{p.stackable?"Acumulable":"No acumulable"} · {p.assignedCount} otorgados</p></div><div className="flex flex-wrap items-center gap-2"><label className="text-xs text-zinc-500">Prob.<input type="number" min="0" step="0.1" defaultValue={p.probability} onBlur={e=>updateProbability(p,e.target.value)} className="ml-1 w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"/></label><button onClick={()=>edit(p)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">Editar</button><button onClick={()=>toggle(p)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">{p.active?"Desactivar":"Activar"}</button></div></div>)}</div></section>
  </div></main>;
}
