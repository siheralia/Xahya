"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CharacterCards } from "@/components/CharacterCards";
type Character={id:number;name:string;flair:string|null};
export default function Home(){
 const [characters,setCharacters]=useState<Character[]>([]);
 const [limit,setLimit]=useState<number|null>(3);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{Promise.all([fetch("/api/characters?mine=true",{cache:"no-store"}),fetch("/api/profile",{cache:"no-store"})]).then(async ([a,b])=>{if(!a.ok||!b.ok)throw Error("No se pudieron cargar los personajes.");const [list,profile]=await Promise.all([a.json(),b.json()]);setCharacters(Array.isArray(list)?list:[]);setLimit(profile.characterLimit??null);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const canCreate=limit===null||characters.length<limit;
 return <main className="flex min-h-screen flex-col bg-zinc-950 text-white"><div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6">
  <header className="flex flex-wrap items-center justify-between gap-4">
   <div>{!loading&&canCreate&&<Link href="/characters/create" className="inline-flex rounded-xl bg-white px-4 py-2 font-semibold text-zinc-950 hover:bg-zinc-200">+ Crear personaje</Link>}</div>
   <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">Xahya</span>
  </header>
  <section className="mt-10 flex-1"><h1 className="mb-6 text-2xl font-bold">Mis personajes</h1>
   {loading?<p className="text-zinc-400">Cargando personajes...</p>:error?<p role="alert" className="text-red-400">{error}</p>:<CharacterCards characters={characters}/>}
  </section>
  <footer className="mt-12 border-t border-zinc-800 py-6 text-sm text-zinc-500">Xahya — Sistema RPG</footer>
 </div></main>;
}
