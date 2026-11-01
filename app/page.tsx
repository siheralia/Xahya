"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CharacterCards } from "@/components/CharacterCards";
type Character={id:number;name:string;flair:string|null};
const sakuraPetals = Array.from({ length: 24 }, (_, index) => index);
export default function Home(){
 const [characters,setCharacters]=useState<Character[]>([]);
 const [limit,setLimit]=useState<number|null>(3);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{Promise.all([fetch("/api/characters?mine=true",{cache:"no-store"}),fetch("/api/profile",{cache:"no-store"})]).then(async ([a,b])=>{if(!a.ok||!b.ok)throw Error("No se pudieron cargar los personajes.");const [list,profile]=await Promise.all([a.json(),b.json()]);setCharacters(Array.isArray(list)?list:[]);setLimit(profile.characterLimit??null);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const canCreate=limit===null||characters.length<limit;
 return <main className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-white">
      <style>{`
        .sakura-layer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 20;
        }

        .sakura-petal {
          position: absolute;
          top: -12%;
          left: 0;
          width: 12px;
          height: 17px;
          border-radius: 70% 25% 70% 25%;
          background: #f4a7bd;
          opacity: 0;
          transform: rotate(25deg);
          animation: sakura-fall linear infinite;
        }

        .sakura-petal::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 15%;
          width: 1px;
          height: 70%;
          background: rgba(255,255,255,.35);
          transform: rotate(18deg);
          transform-origin: center;
        }

        .sakura-petal:nth-child(1) { left: 3%; animation-duration: 10s; animation-delay: -2s; transform: scale(.65) rotate(15deg); }
        .sakura-petal:nth-child(2) { left: 8%; animation-duration: 14s; animation-delay: -8s; transform: scale(.9) rotate(65deg); }
        .sakura-petal:nth-child(3) { left: 13%; animation-duration: 11s; animation-delay: -5s; transform: scale(.5) rotate(120deg); }
        .sakura-petal:nth-child(4) { left: 18%; animation-duration: 16s; animation-delay: -12s; transform: scale(.75) rotate(35deg); }
        .sakura-petal:nth-child(5) { left: 24%; animation-duration: 12s; animation-delay: -4s; transform: scale(.55) rotate(90deg); }
        .sakura-petal:nth-child(6) { left: 29%; animation-duration: 15s; animation-delay: -10s; transform: scale(.8) rotate(155deg); }
        .sakura-petal:nth-child(7) { left: 35%; animation-duration: 13s; animation-delay: -7s; transform: scale(.6) rotate(45deg); }
        .sakura-petal:nth-child(8) { left: 40%; animation-duration: 17s; animation-delay: -14s; transform: scale(.95) rotate(80deg); }
        .sakura-petal:nth-child(9) { left: 46%; animation-duration: 11s; animation-delay: -3s; transform: scale(.5) rotate(170deg); }
        .sakura-petal:nth-child(10) { left: 51%; animation-duration: 14s; animation-delay: -9s; transform: scale(.7) rotate(25deg); }
        .sakura-petal:nth-child(11) { left: 57%; animation-duration: 16s; animation-delay: -6s; transform: scale(.55) rotate(110deg); }
        .sakura-petal:nth-child(12) { left: 62%; animation-duration: 12s; animation-delay: -11s; transform: scale(.85) rotate(60deg); }
        .sakura-petal:nth-child(13) { left: 67%; animation-duration: 15s; animation-delay: -2s; transform: scale(.65) rotate(145deg); }
        .sakura-petal:nth-child(14) { left: 72%; animation-duration: 10s; animation-delay: -7s; transform: scale(.5) rotate(30deg); }
        .sakura-petal:nth-child(15) { left: 77%; animation-duration: 17s; animation-delay: -13s; transform: scale(.9) rotate(100deg); }
        .sakura-petal:nth-child(16) { left: 82%; animation-duration: 13s; animation-delay: -5s; transform: scale(.6) rotate(20deg); }
        .sakura-petal:nth-child(17) { left: 87%; animation-duration: 14s; animation-delay: -10s; transform: scale(.75) rotate(135deg); }
        .sakura-petal:nth-child(18) { left: 92%; animation-duration: 11s; animation-delay: -4s; transform: scale(.5) rotate(70deg); }
        .sakura-petal:nth-child(19) { left: 96%; animation-duration: 16s; animation-delay: -12s; transform: scale(.8) rotate(165deg); }
        .sakura-petal:nth-child(20) { left: 20%; animation-duration: 18s; animation-delay: -16s; transform: scale(.45) rotate(50deg); }
        .sakura-petal:nth-child(21) { left: 43%; animation-duration: 19s; animation-delay: -15s; transform: scale(.7) rotate(125deg); }
        .sakura-petal:nth-child(22) { left: 64%; animation-duration: 18s; animation-delay: -9s; transform: scale(.5) rotate(15deg); }
        .sakura-petal:nth-child(23) { left: 79%; animation-duration: 19s; animation-delay: -17s; transform: scale(.65) rotate(95deg); }
        .sakura-petal:nth-child(24) { left: 90%; animation-duration: 15s; animation-delay: -14s; transform: scale(.55) rotate(40deg); }

        @keyframes sakura-fall {
          0% { top: -12%; opacity: 0; margin-left: 0; }
          8% { opacity: .8; }
          30% { margin-left: 35px; transform: rotate(120deg); }
          55% { margin-left: -30px; transform: rotate(240deg); }
          80% { margin-left: 25px; transform: rotate(330deg); }
          100% { top: 112%; margin-left: -15px; opacity: 0; transform: rotate(450deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sakura-petal { animation: none; opacity: .35; top: 18%; }
          .sakura-petal:nth-child(n+13) { display: none; }
        }
      `}</style>

      <div className="sakura-layer" aria-hidden="true">
        {sakuraPetals.map((petal) => (
          <span className="sakura-petal" key={petal} />
        ))}
      </div>

<div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6">
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
