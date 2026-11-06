"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Row = {
  id:number; name:string; money:number; karma:number; levelUpPoints:number;
  pointsTotal:number; luck:number; hp:number; mana:number; casinoWon:number; casinoSpent:number;
  mazeMoney:number; mazeRooms:number; mazeDiscovered:number; mazeTreasures:number;
  combatWins:number; combatLosses:number; combatDraws:number; combatTotal:number; combatWinRate:number;
};

const rankings = [
  ["Dinero", "money", "💰"],
  ["Puntos totales", "pointsTotal", "✦"],
  ["Karma", "karma", "🪷"],
  ["Más victorias", "combatWins", "⚔️"],
  ["Win rate", "combatWinRate", "🎯"],
  ["Dinero ganado en casino", "casinoWon", "🎰"],
  ["Dinero gastado en casino", "casinoSpent", "💸"],
  ["Dinero ganado en exploración", "mazeMoney", "🗺️"],
  ["Habitaciones descubiertas", "mazeDiscovered", "🧭"],
  ["Habitaciones recorridas", "mazeRooms", "🚪"],
  ["Tesoros encontrados", "mazeTreasures", "💎"],
  ["Puntos de Level Up", "levelUpPoints", "⬆"],
  ["Suerte", "luck", "♧"],
  ["HP máximo", "hp", "♥"],
  ["Mana máximo", "mana", "✧"],
] as const;

function format(value:number) { return value.toLocaleString("en-US"); }
function percentage(value:number) {
  return value.toLocaleString("es-MX",{maximumFractionDigits:2})+" %";
}

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
    entries: rows
      // Don't rank characters with no completed matches as if they had a win rate.
      .filter(row => (key !== "combatWins" && key !== "combatWinRate") || row.combatTotal > 0)
      .sort((a,b) => {
        const difference = Number(b[key]) - Number(a[key]);
        if (difference !== 0) return difference;
        if (key === "combatWinRate") return b.combatTotal-a.combatTotal || b.combatWins-a.combatWins || a.name.localeCompare(b.name,"es");
        if (key === "combatWins") return b.combatWinRate-a.combatWinRate || b.combatTotal-a.combatTotal || a.name.localeCompare(b.name,"es");
        return a.name.localeCompare(b.name,"es");
      })
      .slice(0,5),
  })), [rows]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">Rankings</h1>
            <p className="mt-1 text-sm text-zinc-500">Top 5 de cada categoría.</p>
            <p className="mt-1 text-xs text-zinc-500">En combate cuentan los duelos PvP y de entrenamiento finalizados. Los empates cuentan en el total, no como victorias.</p>
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-zinc-200">{entry.name}</span>
                        {(block.key==="combatWins" || block.key==="combatWinRate") && (
                          <span className="block text-[10px] text-zinc-500">{entry.combatWins} V · {entry.combatLosses} D · {entry.combatDraws} E · {entry.combatTotal} combates</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-white">{block.key==="combatWinRate" ? percentage(entry.combatWinRate) : format(Number(entry[block.key]))}</span>
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
