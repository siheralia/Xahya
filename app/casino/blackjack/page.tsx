"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Card = { rank: string; suit: string; value: number };
type Character = { id: number; name: string; money: number; karma: number; activeGame: boolean };
type Outcome = "playing" | "win" | "lose" | "tie" | "blackjack";

function handValue(hand: Card[]) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function money(value: number) {
  return value.toLocaleString("en-US");
}

function CardView({ card, hidden = false }: { card: Card; hidden?: boolean }) {
  if (hidden) {
    return <div className="flex h-28 w-20 items-center justify-center rounded-xl border-2 border-zinc-700 bg-zinc-950 text-3xl">🂠</div>;
  }
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`flex h-28 w-20 flex-col items-center justify-center rounded-xl border-2 bg-white text-2xl font-black shadow-lg ${red ? "text-red-600" : "text-zinc-900"}`}>
      <span>{card.rank}</span><span>{card.suit}</span>
    </div>
  );
}

export default function BlackjackPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bet, setBet] = useState(50);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [active, setActive] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("playing");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? null, [characters, selectedId]);
  const playerValue = handValue(player);
  const dealerVisible = dealer.length ? handValue(active ? dealer.slice(0, 1) : dealer) : 0;

  useEffect(() => {
    fetch("/api/casino/blackjack")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        const list = data.characters as Character[];
        setCharacters(list);
        const initial = list[0] ?? null;
        setSelectedId(initial?.id ?? null);
        if (initial) setBet(Math.min(50, Math.max(1, initial.money)));
      })
      .catch(() => setError("No se pudieron cargar tus personajes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const current = characters.find((c) => c.activeGame);
    if (current) setSelectedId(current.id);
  }, [characters]);

  async function action(action: "start" | "hit" | "stand") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/casino/blackjack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selected.id, action, bet: Math.floor(Number(bet)) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la jugada.");

      setPlayer(data.player);
      setDealer(data.dealer);
      setActive(Boolean(data.active));
      setOutcome(data.outcome);
      setMessage(
        data.outcome === "blackjack" ? "¡Blackjack!" :
        data.outcome === "win" ? "¡Ganaste!" :
        data.outcome === "lose" ? "Perdiste." :
        data.outcome === "tie" ? "Empate: recuperas tu apuesta." :
        "",
      );
      setCharacters((current) => current.map((c) => c.id === selected.id
        ? { ...c, money: Number(data.money), karma: Number(data.karma), activeGame: Boolean(data.active) }
        : c));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la jugada.");
    } finally {
      setBusy(false);
    }
  }

  function selectCharacter(id: number) {
    if (active || busy) return;
    setSelectedId(id);
    setPlayer([]);
    setDealer([]);
    setOutcome("playing");
    setMessage("");
    setError("");
    const next = characters.find((c) => c.id === id);
    if (next) setBet(Math.min(Math.max(1, bet), Math.max(1, next.money)));
  }

  if (loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando Blackjack...</p></main>;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <Link href="/casino" className="text-sm text-zinc-500 transition hover:text-white">← Casino</Link>
          <div className="text-right"><p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Casino</p><h1 className="text-3xl font-bold">Blackjack</h1></div>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">21</p>
              <h2 className="mt-1 text-2xl font-black">Vence al crupier sin pasar de 21</h2>
              <p className="mt-2 text-sm text-zinc-500">Pedir roba una carta. Plantarse termina tu turno. Cada partida cuesta 1 🪷 de karma.</p>
            </div>
            <details className="max-w-sm text-sm text-zinc-400">
              <summary className="cursor-pointer font-semibold text-zinc-300">¿Cómo jugar?</summary>
              <div className="mt-3 space-y-1">
                <p>• Las cartas numéricas valen su número.</p>
                <p>• J, Q y K valen 10.</p>
                <p>• El As vale 1 u 11 según convenga.</p>
                <p>• Pasar de 21 pierde la partida.</p>
                <p>• Un Blackjack natural paga 3:2.</p>
              </div>
            </details>
          </div>
        </section>

        {error && <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}

        {characters.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <h2 className="text-2xl font-semibold">Necesitas un personaje</h2>
            <Link href="/characters/create" className="mt-6 inline-block rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950">Crear personaje</Link>
          </section>
        ) : (
          <section className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
            <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <label htmlFor="character" className="text-sm text-zinc-400">Personaje</label>
              <select id="character" value={selectedId ?? ""} onChange={(e) => selectCharacter(Number(e.target.value))} disabled={active || busy} className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white">
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.activeGame ? " · partida activa" : ""}</option>)}
              </select>

              {selected && (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs text-zinc-500">Dinero</p><p className="mt-1 text-xl font-bold text-emerald-300">$ {money(selected.money)}</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs text-zinc-500">Karma</p><p className="mt-1 text-xl font-bold text-amber-300">🪷 {selected.karma}</p></div>
                </div>
              )}

              {!active && (
                <>
                  <label htmlFor="bet" className="mt-5 block text-sm text-zinc-400">Apuesta</label>
                  <input id="bet" type="number" min="1" max={selected?.money ?? 1} step="1" value={bet} disabled={busy || !selected} onChange={(e) => setBet(Number(e.target.value))} className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white" />
                  <button type="button" onClick={() => action("start")} disabled={busy || !selected || selected.karma < 1 || selected.money < 1 || !Number.isInteger(Number(bet)) || Number(bet) <= 0 || Number(bet) > selected.money} className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-4 font-black text-zinc-950 disabled:opacity-30">🃏 JUGAR — 1 KARMA</button>
                </>
              )}

              {active && <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => action("hit")} disabled={busy} className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-4 font-bold text-cyan-200 disabled:opacity-30">🃏 Pedir carta</button><button type="button" onClick={() => action("stand")} disabled={busy} className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-4 font-bold text-amber-200 disabled:opacity-30">✋ Plantarse</button></div>}
            </aside>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
              <div>
                <div className="flex items-center justify-between"><h3 className="font-bold text-zinc-300">Crupier</h3><span className="text-sm text-zinc-500">{dealerVisible || ""}</span></div>
                <div className="mt-3 flex min-h-28 flex-wrap gap-3">{dealer.map((card, i) => <CardView key={i} card={card} hidden={active && i === 1} />)}</div>
              </div>
              <div className="my-8 border-t border-zinc-800" />
              <div>
                <div className="flex items-center justify-between"><h3 className="font-bold text-zinc-300">Tu mano</h3><span className="text-sm text-zinc-500">{player.length ? playerValue : ""}</span></div>
                <div className="mt-3 flex min-h-28 flex-wrap gap-3">{player.map((card, i) => <CardView key={i} card={card} />)}</div>
              </div>
              <div className="mt-8 min-h-14 text-center" aria-live="polite">
                {message && <p className={`text-2xl font-black ${outcome === "lose" ? "text-red-400" : outcome === "playing" ? "text-zinc-300" : "text-emerald-300"}`}>{message}</p>}
                {!message && !player.length && <p className="text-zinc-600">Tu partida aparecerá aquí.</p>}
                {player.length > 0 && !active && <p className="mt-1 text-sm text-zinc-500">{outcome === "blackjack" ? "Premio: 3:2" : outcome === "tie" ? "Apuesta devuelta" : "Partida terminada"}</p>}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
