"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Row = {
  id:number; name:string; money:number; karma:number; levelUpPoints:number;
  pointsTotal:number; luck:number; hp:number; mana:number; casinoWon:number;
  mazeMoney:number; mazeRooms:number; mazeTreasures:number;
};

const rankings = [
  ["Dinero", "money", "💰"],
  ["Puntos totales", "pointsTotal", "✦"],
  ["Karma", "karma", "☯"],
  ["Dinero ganado en casino", "casinoWon", "🎰"],
  ["Dinero ganado en exploración", "mazeMoney", "🗺️"],
  ["Habitaciones descubiertas", "mazeRooms", "🚪"],
  ["Tesoros encontrados", "mazeTreasures", "💎"],
  ["Puntos de Level Up", "levelUpPoints", "⬆"],
  ["Suerte", "luck", "♧"],
  ["HP máximo", "hp", "♥"],
  ["Mana máximo", "mana", "✧"],
] as const;

function format(value:number) { return value.toLocaleString("en-US"); }

export default function RankingsPage() {
  const [rows,setRows] = useState<Row[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(() => {
    fetch("/api/management/rankings")
      .then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error === "Forbidden" ? "No tienes permisos para ver los rankings." : "No se pudieron cargar los rankings.");
        setRows(d?.rankings ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "No se pudieron cargar los rankings."))
      .finally(() => setLoading(false));
  }, []);

  const blocks = useMemo(() => rankings.map(([label,key,icon]) => ({
    label,key,icon,
    entries: [...rows].sort((a,b) => Number(b[key]) - Number(a[key])).slice(0,5),
  })), [rows]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">Rankings</h1>
            <p className="mt-1 text-sm text-zinc-500">Top 5 de cada categoría.</p>
          </div>
          <Link href="/management" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900">← Gestión</Link>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
        {loading && <p className="mt-8 text-sm text-zinc-500">Cargando rankings...</p>}

        {!loading && !error && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {blocks.map((block) => (
              <section key={block.key} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:rounded-2xl sm:p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-tight sm:text-base">
                  <span>{block.icon}</span><span>{block.label}</span>
                </h2>
                <div className="mt-3 space-y-1.5">
                  {block.entries.length === 0 ? <p className="text-xs text-zinc-600">Sin personajes</p> : block.entries.map((entry,index) => (
                    <div key={entry.id} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-zinc-950/70 px-2 py-1.5">
                      <span className="w-4 shrink-0 text-[10px] font-bold text-zinc-500">#{index+1}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{entry.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-white">{format(Number(entry[block.key]))}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
