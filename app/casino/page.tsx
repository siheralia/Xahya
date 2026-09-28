"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Character = {
  id: number;
  name: string;
  money: number;
  karma: number;
};

type Segment = {
  label: string;
  weight: number;
};

const SEGMENT_COLORS = [
  "#991b1b", "#d4d4d8", "#b91c1c", "#047857",
  "#dc2626", "#2563eb", "#7f1d1d", "#7c3aed",
  "#c026d3", "#ca8a04", "#111111", "#15803d",
];

const SEGMENTS = [
  { label: "0", weight: 100, multiplier: 0 },
  { label: "+10%", weight: 80, multiplier: 0.1 },
  { label: "0", weight: 100, multiplier: 0 },
  { label: "+50%", weight: 60, multiplier: 0.5 },
  { label: "0", weight: 100, multiplier: 0 },
  { label: "+100%", weight: 40, multiplier: 1 },
  { label: "0", weight: 20, multiplier: 0 },
  { label: "+150%", weight: 30, multiplier: 1.5 },
  { label: "+200%", weight: 20, multiplier: 2 },
  { label: "+500%", weight: 10, multiplier: 5 },
  { label: "-100%", weight: 1, multiplier: -1 },
  { label: "+1000%", weight: 5, multiplier: 10 },
] as const;

const TOTAL_WEIGHT = SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

function formatMoney(value: number) {
  return value.toLocaleString("en-US");
}

function getSegmentCenter(index: number) {
  let degrees = 0;
  for (let i = 0; i < index; i += 1) {
    degrees += (SEGMENTS[i].weight / TOTAL_WEIGHT) * 360;
  }
  return degrees + (SEGMENTS[index].weight / TOTAL_WEIGHT) * 180;
}

export default function CasinoPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bet, setBet] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; payout: number } | null>(null);
  const [history, setHistory] = useState<{ label: string; payout: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? null,
    [characters, selectedId],
  );

  const wheelBackground = useMemo(() => {
    let start = 0;
    const stops: string[] = [];

    for (let index = 0; index < SEGMENTS.length; index += 1) {
      const end = start + (SEGMENTS[index].weight / TOTAL_WEIGHT) * 360;
      stops.push(`${SEGMENT_COLORS[index]} ${start}deg ${end}deg`);
      start = end;
    }

    return `conic-gradient(from 0deg, ${stops.join(", ")})`;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedId = Number(params.get("characterId"));

    fetch("/api/casino")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        const nextCharacters = data.characters as Character[];
        setCharacters(nextCharacters);

        const requested = nextCharacters.find((character) => character.id === requestedId);
        const initial = requested ?? nextCharacters[0] ?? null;
        setSelectedId(initial?.id ?? null);
        if (initial) setBet(Math.min(50, Math.max(1, initial.money)));
      })
      .catch(() => setError("No se pudieron cargar tus personajes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) {
      setBet((current) => Math.min(Math.max(1, current), Math.max(1, selected.money)));
    }
  }, [selected]);

  async function spin() {
    if (!selected || spinning) return;

    const wager = Math.floor(Number(bet));
    if (!Number.isInteger(wager) || wager <= 0) {
      setError("La apuesta debe ser mayor que 0.");
      return;
    }

    if (wager > selected.money) {
      setError("No puedes apostar más dinero del que tienes.");
      return;
    }

    if (selected.karma < 1) {
      setError("Necesitas al menos 1 karma para girar.");
      return;
    }

    setError("");
    setResult(null);
    setSpinning(true);

    try {
      const response = await fetch("/api/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selected.id, bet: wager }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo girar la ruleta.");

      const center = getSegmentCenter(Number(data.segmentIndex));
      const target = rotation + 1800 + ((360 - center - (rotation % 360)) + 360) % 360;
      setRotation(target);

      window.setTimeout(() => {
        const payout = Number(data.payout);
        const nextCharacter = {
          ...selected,
          money: Number(data.money),
          karma: Number(data.karma),
        };

        setCharacters((current) =>
          current.map((character) =>
            character.id === nextCharacter.id ? nextCharacter : character,
          ),
        );
        setResult({ label: data.label, payout });
        setHistory((current) => [
          { label: data.label, payout },
          ...current,
        ].slice(0, 10));
        setSpinning(false);
      }, 4050);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof Error ? err.message : "No se pudo girar la ruleta.");
    }
  }

  function maxBet() {
    if (selected) setBet(Math.max(1, selected.money));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-zinc-500">Cargando casino...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-zinc-500 transition hover:text-white">
            ← Xahya
          </Link>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Casino</p>
            <h1 className="text-3xl font-bold">Caosino</h1>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">
            {error}
          </div>
        )}

        {characters.length === 0 ? (
          <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <h2 className="text-2xl font-semibold">Necesitas un personaje</h2>
            <p className="mt-2 text-zinc-500">Crea un personaje para poder entrar al casino.</p>
            <Link href="/characters/create" className="mt-6 inline-block rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950">
              Crear personaje
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">Jugador</p>
                <label htmlFor="character" className="mt-3 block text-sm text-zinc-400">Personaje</label>
                <select
                  id="character"
                  value={selectedId ?? ""}
                  onChange={(event) => {
                    setSelectedId(Number(event.target.value));
                    setResult(null);
                    setError("");
                  }}
                  disabled={spinning}
                  className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                >
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <p className="text-xs text-zinc-500">Dinero</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-300">$ {formatMoney(selected.money)}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <p className="text-xs text-zinc-500">Karma</p>
                      <p className="mt-1 text-2xl font-bold text-amber-300">🪷 {selected.karma}</p>
                    </div>
                  </div>
                )}

                <label htmlFor="bet" className="mt-6 block text-sm text-zinc-400">Monto de la apuesta</label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="bet"
                    type="number"
                    min="1"
                    max={selected?.money ?? 1}
                    step="1"
                    value={bet}
                    disabled={spinning || !selected}
                    onChange={(event) => setBet(Number(event.target.value))}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={maxBet}
                    disabled={spinning || !selected}
                    className="rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Todo
                  </button>
                </div>

                <p className="mt-2 text-xs text-zinc-600">Cada giro consume 1 karma.</p>

                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || !selected || selected.karma < 1 || selected.money < 1}
                  className="mt-5 w-full rounded-xl bg-gradient-to-b from-red-500 to-red-800 px-5 py-4 text-lg font-black tracking-wide text-white transition hover:from-red-400 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {spinning ? "🎰 GIRANDO..." : "🎰 GIRAR — 1 KARMA"}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-7">
                <div className="flex justify-center">
                  <div className="relative aspect-square w-full max-w-[430px]">
                    <div className="absolute -top-1 left-1/2 z-20 -translate-x-1/2 text-4xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]">▼</div>
                    <div
                      className="absolute inset-2 rounded-full border-8 border-zinc-800 shadow-2xl shadow-black/60 transition-transform"
                      style={{
                        background: wheelBackground,
                        transform: `rotate(${rotation}deg)`,
                        transitionDuration: spinning ? "4s" : "0s",
                        transitionTimingFunction: "cubic-bezier(.12,.75,.18,1)",
                      }}
                    >
                      {SEGMENTS.map((segment, index) => {
                        const center = getSegmentCenter(index);
                        return (
                          <span
                            key={index}
                            className="absolute left-1/2 top-1/2 origin-[0_0] text-[10px] font-black sm:text-xs"
                            style={{
                              transform: `rotate(${center}deg) translateY(-175px) rotate(${-center}deg) translate(-50%,-50%)`,
                              color: index === 1 ? "#111" : "#fff",
                            }}
                          >
                            {segment.label}
                          </span>
                        );
                      })}
                      <div className="absolute inset-[39%] flex items-center justify-center rounded-full border-4 border-amber-300 bg-zinc-950 text-xs font-black text-amber-200">
                        START
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center" aria-live="polite">
                  {result ? (
                    <>
                      <p className="text-3xl font-black">{result.label}</p>
                      <p className={`mt-1 text-xl font-bold ${result.payout >= 0 ? "text-emerald-300" : "text-red-400"}`}>
                        {result.payout > 0 ? "+" : ""}{formatMoney(result.payout)}
                      </p>
                    </>
                  ) : (
                    <p className="text-zinc-500">Resultado</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">Historial</h2>
                <p className="text-xs text-zinc-600">Últimos 10 giros</p>
              </div>
              <div className="mt-3 text-sm text-zinc-400">
                {history.length > 0
                  ? history.map((entry, index) => (
                      <span key={index} className="mr-4 inline-block">
                        {entry.label} {entry.payout > 0 ? "+" : ""}{formatMoney(entry.payout)}
                      </span>
                    ))
                  : "Aún no hay giros en esta sesión."}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
