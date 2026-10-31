"use client";
import {useEffect,useState} from "react";
import {DEFAULT_ELEMENTS,type ManagedElement} from "@/lib/elements/defaults";
export function ElementSelect({value,onChange}:{value?:string;onChange:(value:string)=>void}){
 const [elements,setElements]=useState<ManagedElement[]>(DEFAULT_ELEMENTS);
 useEffect(()=>{fetch("/api/management/elements").then(r=>r.ok?r.json():null).then(d=>{if(Array.isArray(d?.elements))setElements(d.elements);}).catch(()=>{});},[]);
 return <label className="block text-xs text-zinc-400">Elemento<select aria-label="Elemento" value={value||"NEUTRAL"} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">{value&&!elements.some(e=>e.key===value)&&<option value={value}>{value}</option>}{elements.map(e=><option key={e.key} value={e.key}>{e.name}{e.key==="NEUTRAL"?" (0 PCH)":" (+2 PCH)"}</option>)}</select></label>;
}
