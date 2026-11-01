"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Castle, Swords, WandSparkles } from "lucide-react";

type Palette = { primary:string; secondary:string; accent:string; overlayPrimary:string; background:string; surface:string; border:string; foreground:string; muted:string };
type Character = { id:number; name:string; flair:string|null; avatarUrl?:string|null; themePalette?:Partial<Palette>|null; resources?:{money:number;karma:number}|null; derivedStats?:Record<string,number>|null; maze?:{id:number}|null };
const fallback:Palette={primary:"#22d3ee",secondary:"#8b5cf6",accent:"#f59e0b",overlayPrimary:"#22d3ee",background:"#09090b",surface:"#18181b",border:"#3f3f46",foreground:"#ffffff",muted:"#a1a1aa"};
export function CharacterCards({characters}:{characters:Array<{id:number;name:string;flair:string|null}>}) {
 const [details,setDetails]=useState<Record<number,Character>>({});
 useEffect(()=>{let active=true;Promise.all(characters.map(async c=>{try{const response=await fetch("/api/characters/"+c.id,{cache:"no-store"});if(!response.ok)return null;return await response.json() as Character;}catch{return null;}})).then(rows=>{if(active)setDetails(Object.fromEntries(rows.filter((x):x is Character=>!!x).map(x=>[x.id,x])));});return()=>{active=false;};},[characters]);
 if(!characters.length)return <p className="rounded-xl border border-zinc-800 p-6 text-zinc-400">Todavía no tienes personajes.</p>;
 return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{characters.map(base=>{
  const c:Character=details[base.id]??base;
  const p={...fallback,...(c.themePalette??{})};
  const phys=Number(c.derivedStats?.physicalAttack??0),magic=Number(c.derivedStats?.magicAttack??0);
  const isMagic=magic>phys;
  return <article key={c.id} className="relative overflow-hidden rounded-2xl border shadow-lg" style={{background:p.surface,borderColor:p.border,color:p.foreground}}>
   {c.avatarUrl&&<div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20" style={{backgroundImage:`url("${c.avatarUrl}")`}}/>}
   <div className="relative flex gap-4 p-4">
    <Link href={`/characters/${c.id}`} className="h-28 w-24 shrink-0 overflow-hidden rounded-xl border" style={{borderColor:p.primary}} aria-label={`Ver ficha de ${c.name}`}>
     {c.avatarUrl?<img src={c.avatarUrl} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-3xl" style={{background:p.background}}>{c.flair||"✦"}</div>}
    </Link>
    <div className="min-w-0 flex-1">
     <Link href={`/characters/${c.id}`} className="font-bold hover:underline" style={{color:p.primary}}>{c.name} {c.flair&&<span>⟨{c.flair}⟩</span>}</Link>
     <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm">
      <span title="Dinero" style={{color:"#facc15"}}>◈ {c.resources?.money?.toLocaleString("es-MX")??"—"}</span>
      <span title="Karma">🪷 {c.resources?.karma??"—"}</span>
      <span className="inline-flex items-center gap-1" title={isMagic?"Ataque mágico":"Ataque físico"}>{isMagic?<WandSparkles size={15}/>:<Swords size={15}/>} {c.derivedStats?Math.max(phys,magic).toLocaleString("es-MX"):"—"}</span>
     </div>
     <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
      <Link href={`/characters/${c.id}`} className="rounded-lg border px-3 py-2" style={{borderColor:p.primary,color:p.foreground}}>Ver ficha</Link>
      {c.maze&&<Link href="/maze" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" style={{borderColor:p.accent,color:p.accent}}><Castle size={15}/> Laberinto</Link>}
     </div>
    </div>
   </div>
  </article>;
 })}</div>;
}
