"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Character = {
  id: number;
  name: string;
  money: number;
  karma: number;
};

type Mode = "exact" | "highlow" | "evenodd" | "range";

function formatMoney(value: number) {
  return value.toLocaleString("en-US");
}

export default function DicePage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("exact");
  const [target, setTarget] = useState(20);
  const [bet, setBet] = useState(50);
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);
  const [result, setResult] = useState<{ roll: number; won: boolean; payout: number } | null>(null);
  const [history, setHistory] = useState<{ roll: number; won: boolean; payout: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? null,
    [characters, selectedId],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedId = Number(params.get("characterId"));

    fetch("/api/casino/dice")
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

  function updateMode(nextMode: Mode) {
    setMode(nextMode);
    setResult(null);
    setError("");
    if (nextMode === "exact") setTarget(20);
    if (nextMode === "highlow") setTarget(1);
    if (nextMode === "evenodd") setTarget(1);
  }

  async function rollDice() {
    if (!selected || rolling) return;

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
      setError("Necesitas al menos 1 karma para jugar.");
      return;
    }

    setError("");
    setResult(null);
    setRolling(true);

    try {
      const response = await fetch("/api/casino/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selected.id, bet: wager, mode, target }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo lanzar el dado.");

      const finalRoll = Number(data.roll);
      let ticks = 0;
      const animation = window.setInterval(() => {
        setDisplayRoll(Math.floor(Math.random() * 20) + 1);
        ticks += 1;
        if (ticks >= 12) {
          window.clearInterval(animation);
          setDisplayRoll(finalRoll);
          setCharacters((current) =>
            current.map((character) =>
              character.id === selected.id
                ? { ...character, money: Number(data.money), karma: Number(data.karma) }
                : character,
            ),
          );
          const entry = { roll: finalRoll, won: Boolean(data.won), payout: Number(data.payout) };
          setResult(entry);
          setHistory((current) => [entry, ...current].slice(0, 10));
          setRolling(false);
        }
      }, 90);
    } catch (err) {
      setRolling(false);
      setError(err instanceof Error ? err.message : "No se pudo lanzar el dado.");
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
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <Link href="/casino" className="text-sm text-zinc-500 transition hover:text-white">
            ← Casino
          </Link>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Casino</p>
            <h1 className="text-3xl font-bold">🎲 Dados</h1>
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
            <p className="mt-2 text-zinc-500">Crea un personaje para poder jugar.</p>
            <Link href="/characters/create" className="mt-6 inline-block rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950">
              Crear personaje
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                <label className="block text-sm text-zinc-400">Personaje</label>
                <select
                  value={selectedId ?? ""}
                  onChange={(event) => {
                    setSelectedId(Number(event.target.value));
                    setResult(null);
                    setError("");
                  }}
                  disabled={rolling}
                  className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                >
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>

                {selected && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <p className="text-xs text-zinc-500">Dinero</p>
                      <p className="mt-1 font-bold text-emerald-300">$ {formatMoney(selected.money)}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <p className="text-xs text-zinc-500">Karma</p>
                      <p className="mt-1 font-bold text-amber-300">🪷 {selected.karma}</p>
                    </div>
                  </div>
                )}

                <label className="mt-6 block text-sm text-zinc-400">Tipo de apuesta</label>
                <select
                  value={mode}
                  onChange={(event) => updateMode(event.target.value as Mode)}
                  disabled={rolling}
                  className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                >
                  <option value="exact">🎯 Número exacto — x15</option>
                  <option value="highlow">⬆️ Alto / Bajo — x1</option>
                  <option value="evenodd">⚖️ Par / Impar — x1</option>
                  <option value="range">🔥 15–20 — x3</option>
                </select>

                {mode === "exact" && (
                  <label className="mt-4 block text-sm text-zinc-400">
                    Número
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={target}
                      onChange={(event) => setTarget(Math.max(1, Math.min(20, Math.trunc(Number(event.target.value) || 1))))}
                      disabled={rolling}
                      className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                    />
                  </label>
                )}

                {mode === "highlow" && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setTarget(1)} disabled={rolling} className={`rounded-xl border px-4 py-3 font-semibold ${target === 1 ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-400"}`}>
                      Bajo 1–10
                    </button>
                    <button type="button" onClick={() => setTarget(2)} disabled={rolling} className={`rounded-xl border px-4 py-3 font-semibold ${target === 2 ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-400"}`}>
                      Alto 11–20
                    </button>
                  </div>
                )}

                {mode === "evenodd" && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setTarget(1)} disabled={rolling} className={`rounded-xl border px-4 py-3 font-semibold ${target === 1 ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-400"}`}>
                      Par
                    </button>
                    <button type="button" onClick={() => setTarget(2)} disabled={rolling} className={`rounded-xl border px-4 py-3 font-semibold ${target === 2 ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-400"}`}>
                      Impar
                    </button>
                  </div>
                )}

                <label className="mt-6 block text-sm text-zinc-400">Apuesta</label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max={selected?.money ?? 1}
                    value={bet}
                    onChange={(event) => setBet(Number(event.target.value))}
                    disabled={rolling || !selected}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400"
                  />
                  <button type="button" onClick={maxBet} disabled={rolling || !selected} className="rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
                    Todo
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-600">Cada tirada consume 1 karma.</p>

                <button
                  type="button"
                  onClick={rollDice}
                  disabled={rolling || !selected || selected.karma < 1 || selected.money < 1}
                  className="mt-5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-5 py-4 text-lg font-black tracking-wide text-zinc-950 transition hover:from-amber-300 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {rolling ? "🎲 LANZANDO..." : "🎲 LANZAR — 1 KARMA"}
                </button>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7">
                <div className={`flex h-52 w-52 items-center justify-center rounded-[2.5rem] border-4 border-zinc-700 bg-zinc-100 text-8xl font-black text-zinc-950 shadow-2xl shadow-black/50 transition-transform ${rolling ? "animate-bounce" : ""}`}>
                  {displayRoll ?? "?"}
                </div>
                <p className="mt-7 text-xs uppercase tracking-[0.3em] text-zinc-600">D20</p>
                <div className="mt-4 text-center" aria-live="polite">
                  {result ? (
                    <>
                      <p className={`text-3xl font-black ${result.won ? "text-emerald-300" : "text-red-400"}`}>
                        {result.won ? "¡GANASTE!" : "Perdiste"}
                      </p>
                      <p className="mt-1 text-xl font-bold text-zinc-300">
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
                <p className="text-xs text-zinc-600">Últimas 10 tiradas</p>
              </div>
              <div className="mt-3 text-sm text-zinc-400">
                {history.length
                  ? history.map((entry, index) => (
                      <span key={index} className="mr-4 inline-block">
                        🎲 {entry.roll} {entry.won ? "+" : ""}{formatMoney(entry.payout)}
                      </span>
                    ))
                  : "Aún no hay tiradas en esta sesión."}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
