"use client";
import {useEffect,useId,useState} from "react";
type Result={id:number;name:string;characterName:string;complexityPch:number;requiredPch:number};
type Props={characterId:number;stealingSkillId:number;busy:boolean;refreshKey?:number;onSteal:(sourceId:number)=>void|Promise<void>};
export function SkillTheftSourceSearch({characterId,stealingSkillId,busy,refreshKey=0,onSteal}:Props){
  const id=useId();const [term,setTerm]=useState("");const [results,setResults]=useState<Result[]>([]);
  const [selected,setSelected]=useState<number|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{
    if(term.trim().length<2){setResults([]);setLoading(false);return;}
    const controller=new AbortController();
    const timeout=setTimeout(async()=>{
      setLoading(true);setError("");
      try{
        const query=new URLSearchParams({q:term.trim(),stealingSkillId:String(stealingSkillId)});
        const r=await fetch("/api/characters/"+characterId+"/skills/thefts/search?"+query.toString(),{cache:"no-store",signal:controller.signal});
        const d=await r.json();
        if(!r.ok)throw Error(d?.error??"No se pudo buscar.");
        if(!controller.signal.aborted){const found=Array.isArray(d.skills)?d.skills:[];setResults(found);setSelected(old=>found.some((x:Result)=>x.id===old)?old:null);}
      }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:"Error al buscar.");setResults([]);}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },250);
    return()=>{clearTimeout(timeout);controller.abort();};
  },[term,characterId,stealingSkillId,refreshKey]);
  return <div className="mt-2 space-y-2">
    <label htmlFor={id} className="block text-xs text-zinc-300">Buscar habilidad para robar por nombre</label>
    <input id={id} type="search" value={term} maxLength={80} onChange={e=>{setTerm(e.target.value);setSelected(null);}}
      placeholder="Escribe al menos dos letras…" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/>
    <p aria-live="polite" className="text-xs text-zinc-400">{loading?"Buscando…":error||"Solo aparecen habilidades originales compatibles de otros personajes."}</p>
    {results.length>0&&<div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-zinc-700 p-1">
      {results.map(skill=><button key={skill.id} type="button" onClick={()=>setSelected(skill.id)}
        className={"w-full rounded-md p-2 text-left text-xs "+(skill.id===selected?"bg-rose-900/40 text-rose-100":"hover:bg-zinc-800")}>
        <span className="block font-semibold">{skill.name} · {skill.characterName}</span>
        <span className="text-zinc-400">{skill.complexityPch} PCH de origen · requiere {skill.requiredPch} PCH para robo</span>
      </button>)}
    </div>}
    <button type="button" disabled={busy||selected===null} onClick={()=>{if(selected!==null)void onSteal(selected);}}
      className="rounded-lg border border-rose-500 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">
      {busy?"Robando…":"Robar habilidad temporalmente"}
    </button>
  </div>;
}
