"use client";
import { SkillFormModal } from "@/components/skills/SkillFormModal";

import { SkillEffectsEditor } from "@/components/skills/SkillEffectsEditor";
import { SkillCoreFields } from "@/components/skills/SkillCoreFields";

import { useEffect, useMemo, useState } from "react";

import { EFFECT_CATALOG, EFFECT_TARGETS, resolveEffectTargets } from "@/lib/effects/catalog";
import { effectPchCost, skillEffectMultiplier } from "@/lib/skills/pch";
import { manaAdjustedPch } from "@/lib/skills/mana-pricing";
import { applyRangePch } from "@/lib/skills/range-pricing";

type Effect = { type: string; target?: string; value?: number; description?: string };
type Skill = {
  id:number; characterId:number; name:string; cost:number; pchCost:number; accumulationCost:number; accumulationPerTick:number; maintenanceCost:number; description:string|null; duration:string|null;
  category:string; basicType:string|null; attackType:string|null; defenseType:string|null; areaOfEffect:string|null; speed:string|null; cooldown:string|null; effect:Effect[];
  condition:string|null; requiredSkillIds?:number[]; status:string; approvedAt:string|null; character?: { id:number; name:string }|null;
};

const categories = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]];
const effectTypes=[...EFFECT_CATALOG.filter(e=>e.type!=="MAZE_UTILITY").map(e=>[e.type,e.label] as const),["MAZE_UTILITY_INVISIBILITY","Invisibilidad"],["MAZE_UTILITY_FLOATING","Flotar"]] as const;
const blankEffect=():Effect=>({type:"STAT_BONUS",target:"STR",value:10,description:""});
const blankForm=()=>({characterId:"",name:"",cost:0,pchCost:0,accumulationCost:0,accumulationPerTick:0,maintenanceCost:0,description:"",duration:"Instantánea",category:"UTILITY",areaOfEffect:"Objetivo único",maxRangeMeters:5,speed:"DEFAULT",cooldown:"Sin cooldown",condition:"",requiredSkillIds:[] as number[],effect:[] as Effect[]});

export default function SkillsManagementPage(){
  const [skills,setSkills]=useState<Skill[]>([]);
  const [effectDefinitions,setEffectDefinitions]=useState<{type:string;label:string;targets:{key:string;label:string}[]}[]>([]);
  const [narrativeCards,setNarrativeCards]=useState<{id:string;name:string;description:string;category:string;pch:number}[]>([]);
  const [statDefinitions,setStatDefinitions]=useState<{key:string;name:string;kind:"basic"|"derived";active?:boolean}[]>([]);
  useEffect(() => { fetch("/api/management/effect-targets").then((r) => r.ok ? r.json() : null).then((data) => { if (data?.statistics) setStatDefinitions(data.statistics); if (data?.effects) setEffectDefinitions(data.effects); if (data?.narrativeCards) setNarrativeCards(data.narrativeCards); }).catch(() => {}); }, []);
  const [characters,setCharacters]=useState<{id:number;name:string}[]>([]);
  const [filter,setFilter]=useState("PENDING");
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<number|null>(null);
  const [form,setForm]=useState(blankForm());
  const [modal,setModal]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");

  async function load(){
    setError("");
    try{
      const [sr,cr]=await Promise.all([fetch("/api/management/skills",{cache:"no-store"}),fetch("/api/characters?mine=false",{cache:"no-store"})]);
      const sd=await sr.json(); const cd=await cr.json();
      if(!sr.ok) throw new Error(sd.error);
      setSkills(sd.skills??[]);
      if(cr.ok) setCharacters((cd??[]).map((c:any)=>({id:Number(c.id),name:String(c.name)})));
    }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar las habilidades.");}
  }
  useEffect(()=>{void load();},[]);

  const pchBase = form.effect.reduce((sum,e) => sum + effectPchCost(e), 0);
  const pchManaAdjusted = manaAdjustedPch(pchBase, form.cost);
  const pchSpeedAdjusted = pchManaAdjusted + (!form.speed || form.speed === "DEFAULT" ? 0 : 5);
  const pchTotal = applyRangePch(pchSpeedAdjusted, form.maxRangeMeters);

  const visible=useMemo(()=>skills.filter(s=>{
    const q=search.trim().toLowerCase();
    return (filter==="ALL"||s.status===filter) &&
      (!q||s.name.toLowerCase().includes(q)||String(s.character?.name??"").toLowerCase().includes(q));
  }),[skills,filter,search]);

  function edit(skill:Skill){
    setSelected(skill.id);
    setForm({
      characterId:String(skill.characterId),name:skill.name,cost:Number(skill.cost),pchCost:Number(skill.pchCost??0),accumulationCost:Number(skill.accumulationCost??0),accumulationPerTick:Number(skill.accumulationPerTick??0),maintenanceCost:Number(skill.maintenanceCost??0),description:skill.description??"",
      duration:skill.duration??"",category:skill.category,areaOfEffect:skill.areaOfEffect??"",maxRangeMeters:Number(skill.areaOfEffect?.match(/Alcance máximo: (\d+) m/)?.[1]??5),speed:skill.speed??"DEFAULT",
      cooldown:skill.cooldown??"",condition:skill.condition??"",requiredSkillIds:skill.requiredSkillIds??[],effect:Array.isArray(skill.effect)?skill.effect:[],
    });
    setModal(true);setError("");setSuccess("");
  }
  function create(){
    setSelected(null);setForm(blankForm());setModal(true);setError("");setSuccess("");
  }
  function addEffect(){setForm(f=>({...f,effect:[...f.effect,blankEffect()]}));}
  function updateEffect(i:number,key:string,value:string){
    setForm(f=>({...f,effect:f.effect.map((e,idx)=>{
      if(idx!==i) return e;
      if(key==="type" && value==="MAZE_UTILITY_INVISIBILITY") return {...e,type:"MAZE_UTILITY",target:"INVISIBILITY",value:1};
      if(key==="type" && value==="MAZE_UTILITY_FLOATING") return {...e,type:"MAZE_UTILITY",target:"FLOATING",value:1};
      return {...e,[key]:key==="value"?Number(value):value};
    })}));
  }
  async function save(approve=false,reject=false){
    if(!form.characterId){setError("Selecciona el personaje.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      const url=selected?"/api/management/skills/"+selected:"/api/management/skills";
      const body={...form,characterId:Number(form.characterId),approve,reject};
      const r=await fetch(url,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const raw=await r.text();
      let d:any={};
      try { d=raw?JSON.parse(raw):{}; } catch { d={}; }
      if(!r.ok) throw new Error(d.error||`Error HTTP ${r.status}`);
      setSuccess(approve?"Habilidad aprobada.":reject?"Habilidad rechazada.":"Cambios guardados sin aprobar.");
      setModal(false);
      setSelected(null);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
    finally{setBusy(false);}
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-4xl font-bold">Habilidades</h1><p className="mt-2 text-zinc-500">Solicitudes de habilidades creadas por personajes y catálogo aprobado.</p></div>
      <button onClick={create} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">Nueva habilidad</button>
    </div>
    {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}
    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar habilidad o personaje..." className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/>
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
          <option value="PENDING">Pendientes</option><option value="APPROVED">Aprobadas</option><option value="REJECTED">Rechazadas</option><option value="ALL">Todas</option>
        </select>
      </div>
      <div className="mt-5 space-y-3">
        {visible.map(skill=><button key={skill.id} onClick={()=>edit(skill)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-left hover:border-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><span className="font-semibold">{skill.name}</span><span className="ml-2 text-xs text-zinc-500">#{skill.id}</span></div>
            <span className={"rounded-full border px-2 py-1 text-xs "+(skill.status==="APPROVED"?"border-emerald-400/30 text-emerald-300":skill.status==="REJECTED"?"border-red-400/30 text-red-300":"border-amber-400/30 text-amber-300")}>{skill.status==="APPROVED"?"Aprobada":skill.status==="REJECTED"?"Rechazada":"Pendiente"}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{skill.character?.name??("Personaje #"+skill.characterId)} · {categories.find(c=>c[0]===skill.category)?.[1]??skill.category} · Coste {skill.cost}{Number(skill.accumulationCost??0)>0?" · Acumulación "+skill.accumulationCost:""}{Number(skill.accumulationPerTick??0)>0?" · +"+skill.accumulationPerTick+" acumulación/tick":""}{Number(skill.maintenanceCost??0)>0?" · Mantenimiento/turno "+skill.maintenanceCost:""}</p>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{skill.description}</p>
        </button>)}
        {!visible.length&&<p className="py-8 text-center text-sm text-zinc-500">No hay habilidades con este filtro.</p>}
      </div>
    </section>

    <SkillFormModal availableSkills={skills} characterId={Number(form.characterId)} editingSkillId={selected} open={modal} title={selected?"Editar habilidad":"Crear habilidad"} onClose={()=>setModal(false)} form={form} onChange={setForm} statistics={statDefinitions} narrativeCards={narrativeCards} effectDefinitions={effectDefinitions} priceEffect={effectPchCost} pch={{total:pchTotal,base:pchBase,manaAdjusted:pchManaAdjusted}} characterSelector={<label className="block text-sm text-zinc-400">Personaje<select value={form.characterId} onChange={e=>setForm({...form,characterId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{characters.map(c=><option key={c.id} value={c.id}>{c.name} #{c.id}</option>)}</select></label>} actions={<div className="flex flex-wrap gap-2"><button onClick={()=>save(false,false)} disabled={busy} className="rounded-lg border border-zinc-700 px-4 py-3 font-medium">Guardar sin aprobar</button><button onClick={()=>save(false,true)} disabled={busy} className="rounded-lg border border-red-900/70 px-4 py-3 font-medium text-red-300">Rechazar</button><button onClick={()=>save(true,false)} disabled={busy} className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950">Guardar y aprobar</button></div>} />
  </div></main>;
}
