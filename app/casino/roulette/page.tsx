"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Character = {
  id: number;
  name: string;
  money: number;
  karma: number;
};

type HistoryEntry = { id: number; createdAt: string; bet: number; label: string; payout: number; moneyAfter: number; karmaAfter: number; };

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
  { label: "-100%", weight: 1, multiplier: -2 },
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

export default function RoulettePage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bet, setBet] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [animateWheel, setAnimateWheel] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [batchResults, setBatchResults] = useState<Array<{ label: string; payout: number; money: number; karma: number }>>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [result, setResult] = useState<{ label: string; payout: number } | null>(null);
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
        if (initial) {
          setBet(Math.min(50, Math.max(1, initial.money)));
          fetch(`/api/casino?characterId=${initial.id}`).then((r) => r.json()).then((d) => setHistory(d.history ?? [])).catch(() => {});
        }
      })
      .catch(() => setError("No se pudieron cargar tus personajes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) {
      setBet((current) => Math.min(Math.max(1, current), Math.max(1, selected.money)));
    }
  }, [selected]);

  async function spin(count = 1) {
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
    setBatchResults([]);
    setSpinning(true);

    try {
      const response = await fetch("/api/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selected.id, bet: wager, count }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo girar la ruleta.");

      const final = data.results?.[data.results.length - 1] ?? data;
      const center = getSegmentCenter(Number(final.segmentIndex));
      const target = rotation + (animateWheel ? 1800 : 0) + ((360 - center - (rotation % 360)) + 360) % 360;
      setRotation(target);

      window.setTimeout(() => {
        const payout = Number(final.payout);
        const nextCharacter = {
          ...selected,
          money: Number(final.money),
          karma: Number(final.karma),
        };

        setCharacters((current) =>
          current.map((character) =>
            character.id === nextCharacter.id ? nextCharacter : character,
          ),
        );
        setResult({ label: final.label, payout });
        if (count > 1) {
          setBatchResults(data.results.map((roll: { label: string; payout: number; money: number; karma: number }) => ({
            label: roll.label,
            payout: Number(roll.payout),
            money: Number(roll.money),
            karma: Number(roll.karma),
          })));
          setShowBatch(true);
        }
        const refreshed = await fetch(`/api/casino?characterId=${selected.id}`).then((r) => r.json()).catch(() => null);
        if (refreshed?.history) setHistory(refreshed.history);
        setSpinning(false);
      }, 4050);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof Error ? err.message : "No se pudo girar la ruleta.");
    }
  }

  async function spinTen() {
    if (!selected || spinning || selected.karma < 10) return;
    await spin(10);
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
                    const nextId = Number(event.target.value);
                    setSelectedId(nextId);
                    setResult(null);
                    setError("");
                    fetch(`/api/casino?characterId=${nextId}`).then((r) => r.json()).then((data) => setHistory(data.history ?? [])).catch(() => setHistory([]));
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

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                    <label htmlFor="animate-wheel" className="text-sm text-zinc-400">Animación de giro</label>
                    <button id="animate-wheel" type="button" role="switch" aria-checked={animateWheel} onClick={() => setAnimateWheel((value) => !value)} className={`relative h-6 w-11 rounded-full transition ${animateWheel ? "bg-amber-400" : "bg-zinc-700"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${animateWheel ? "left-6" : "left-1"}`} />
                    </button>
                  </div>

                <p className="mt-2 text-xs text-zinc-600">Cada giro consume 1 karma.</p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => spin(1)}
                    disabled={spinning || !selected || selected.karma < 1 || selected.money < 1}
                    className="rounded-xl bg-gradient-to-b from-red-500 to-red-800 px-5 py-4 text-lg font-black tracking-wide text-white transition hover:from-red-400 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {spinning ? "🎰 GIRANDO..." : "🎰 GIRAR — 1"}
                  </button>
                  <button
                    type="button"
                    onClick={spinTen}
                    disabled={spinning || !selected || selected.karma < 10 || selected.money < 1}
                    className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-lg font-black tracking-wide text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    🎰 10 TIRADAS
                  </button>
                </div>
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
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-600">
                    <tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Apuesta</th><th className="px-3 py-3">Resultado</th><th className="px-3 py-3">Ganó / perdió</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Karma</th></tr>
                  </thead>
                  <tbody>
                    {history.map((entry, index) => (
                      <tr key={entry.id} className="border-b border-zinc-900">
                        <td className="px-3 py-3 text-zinc-600">{history.length - index}</td>
                        <td className="px-3 py-3 text-zinc-300">$ {formatMoney(entry.bet)}</td>
                        <td className="px-3 py-3 font-bold">{entry.label}</td>
                        <td className={`px-3 py-3 font-semibold ${entry.payout >= 0 ? "text-emerald-300" : "text-red-400"}`}>{entry.payout > 0 ? "+" : ""}{formatMoney(entry.payout)}</td>
                        <td className={`px-3 py-3 font-semibold ${entry.moneyAfter < 0 ? "text-red-400" : "text-white"}`}>$ {formatMoney(entry.moneyAfter)}</td>
                        <td className="px-3 py-3 text-amber-300">🪷 {entry.karmaAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history.length === 0 && <p className="py-8 text-center text-sm text-zinc-600">Aún no hay giros registrados.</p>}
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {Object.entries(history.reduce<Record<string, number>>((counts, entry) => {
                  counts[entry.label] = (counts[entry.label] ?? 0) + 1;
                  return counts;
                }, {})).map(([label, count]) => (
                  <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-center">
                    <p className="font-bold">{label}</p><p className="text-xs text-zinc-600">{count} aparición{count === 1 ? "" : "es"}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

          {showBatch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowBatch(false)}>
              <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Resultados — 10 tiradas</h2><button onClick={() => setShowBatch(false)} className="text-zinc-500 hover:text-white">✕</button></div>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  {batchResults.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between border-b border-zinc-900 py-3 text-sm">
                      <span className="text-zinc-600">#{index + 1}</span><span className="font-bold">{entry.label}</span><span className={entry.payout >= 0 ? "text-emerald-300" : "text-red-400"}>{entry.payout > 0 ? "+" : ""}{formatMoney(entry.payout)}</span><span className="text-zinc-400">$ {formatMoney(entry.money)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowBatch(false)} className="mt-4 w-full rounded-xl bg-zinc-800 py-3 font-semibold hover:bg-zinc-700">Cerrar</button>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}
