"use client";
import {useEffect,useState} from "react";
import {EFFECT_LABELS} from "@/lib/effects/catalog";
import type {CombatSkillPreview} from "@/lib/combat/skill-preview";
import type {Side} from "@/lib/combat/turn-engine";

type RosterResponse={skills:Record<Side,CombatSkillPreview[]>};
const categories:Record<string,string>={
 OFFENSIVE:"Ofensiva",SUPPORT:"Soporte",UTILITY:"Utilidad",
 PASSIVE:"Pasiva",BASIC:"Básica",
};
const attackTypes:Record<string,string>={CUT:"Corte",BLUNT:"Contundente",PIERCE:"Penetración"};
const actionNames:Record<string,string>={
 CREATE_FIELD:"Crear campo",CHANGE_FIELD:"Modificar campo",
 EXPOSE:"Exponer",CLEANSE:"Limpiar",STATUS:"Estado",
 MANA_WARD:"Barrera de maná",
};

export default function CombatSkillLoadout({
 encounterId,side,authorized,
}:{encounterId:string;side:Side;authorized:boolean}) {
 const [skills,setSkills]=useState<Record<Side,CombatSkillPreview[]>>({PLAYER:[],NPC:[]});
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!authorized)return;
  let live=true;
  setBusy(true);setError("");
  (async()=>{
   try{
    const r=await fetch("/api/combat/"+encounterId+"/skills",{cache:"no-store"});
    const payload=await r.json() as RosterResponse&{error?:string};
    if(!r.ok)throw new Error(payload.error||"No se pudieron consultar las habilidades.");
    if(live)setSkills(payload.skills);
   }catch(e){
    if(live)setError(e instanceof Error?e.message:"Error de consulta.");
   }finally{if(live)setBusy(false);}
  })();
  return()=>{live=false;};
 },[encounterId,authorized,side]);
 if(!authorized)return null;
 const roster=skills[side]??[];
 return <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
  <h2 className="text-lg font-semibold">Habilidades del personaje · fase 2.1</h2>
  <p className="mt-1 text-sm text-zinc-400">Catálogo aprobado conectado a la ficha. Los costes y efectos se muestran para preparar su ejecución; todavía no se pueden lanzar habilidades desde esta pantalla.</p>
  {busy?<p className="mt-3 text-sm text-zinc-400">Consultando habilidades aprobadas…</p>
  :error?<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>
  :roster.length===0?<p className="mt-3 text-sm text-zinc-400">Este personaje no tiene habilidades aprobadas y disponibles para consultar.</p>
  :<div className="mt-4 space-y-2">
   {roster.map(skill=><details key={skill.id} className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
    <summary className="cursor-pointer font-medium">
     {skill.name} <span className="text-xs font-normal text-zinc-400">· {categories[skill.category]??skill.category} · {skill.manaCost} maná configurado</span>
     {skill.active&&<span className="ml-2 text-xs text-cyan-300">Activa</span>}
     {!skill.requirementsSatisfied&&<span className="ml-2 text-xs text-amber-300">Requisitos no cumplidos</span>}
    </summary>
    <div className="mt-3 space-y-2 text-sm text-zinc-300">
     {skill.description&&<p className="whitespace-pre-line">{skill.description}</p>}
     <div className="grid gap-1 sm:grid-cols-2">
      <span>Maná configurado: <b>{skill.manaCost}</b></span>
      <span>Mantenimiento: <b>{skill.maintenanceCost}</b></span>
      <span>Acumulación: <b>{skill.accumulationCost}</b></span>
      <span>Alcance: <b>{skill.rangeMeters===null?"Por definir":skill.rangeMeters+" m"}</b></span>
      <span>Área: <b>{skill.area}</b></span>
      <span>Velocidad: <b>{skill.speed==="DEFAULT"?"Predeterminada":skill.speed}</b></span>
      <span>Duración: <b>{skill.duration??"Sin especificar"}</b></span>
      <span>Cooldown: <b>{skill.cooldown??"Sin cooldown"}</b></span>
      {skill.attackType&&<span>Tipo de ataque: <b>{attackTypes[skill.attackType]}</b></span>}
      {skill.defenseType&&<span>Tipo de defensa: <b>{skill.defenseType}</b></span>}
     </div>
     {skill.effectTypes.length>0&&<p>Efectos: {skill.effectTypes.map(type=>(EFFECT_LABELS as Record<string,string>)[type]??type).join(", ")}</p>}
     {skill.mechanicActions.length>0&&<p>Acciones mecánicas: {skill.mechanicActions.map(type=>actionNames[type]??type).join(", ")}</p>}
     <p className="text-xs text-zinc-500">Ejecución en combate pendiente de la fase 2.2. Los PCH de creación no se consumen al combatir.</p>
    </div>
   </details>)}
  </div>}
 </section>;
}
