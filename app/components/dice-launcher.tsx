"use client";

import { useState } from "react";

type Result = { rolls: number[]; total: number; effectiveChance: number; success: boolean | null };
const faces = [4, 6, 8, 10, 12, 20, 100];
const field = "w-full rounded-lg border border-amber-700/40 bg-zinc-950 px-3 py-2 text-zinc-100";
export default function DiceLauncher({ characters }: { characters: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"free" | "probability">("probability");
  const [sides, setSides] = useState(100);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [chance, setChance] = useState(75);
  const [min, setMin] = useState(5);
  const [max, setMax] = useState(95);
  const [characterId, setCharacterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ total: number; sides: number; when: string }[]>([]);
  async function roll() {
    if (loading) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/dice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, sides: mode === "probability" ? 100 : sides,
          count: mode === "probability" ? 1 : count, modifier: mode === "probability" ? 0 : modifier,
          chance, min, max, characterId: characterId ? Number(characterId) : null })
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(response.redirected
          ? "La sesión expiró. Recarga la página e inicia sesión nuevamente."
          : `El servidor devolvió HTML en lugar de JSON (HTTP ${response.status}). Revisa los registros del despliegue.`);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `No se pudo tirar el dado (HTTP ${response.status}).`);
      if (!Array.isArray(data.rolls) || typeof data.total !== "number") throw new Error("Respuesta de tirada inválida.");
      setResult(data as Result);
      setHistory(h => [{ total: data.total, sides: mode === "probability" ? 100 : sides, when: new Date().toLocaleTimeString("es-MX") }, ...h].slice(0, 8));
    } catch (e) { setError(e instanceof Error ? e.message : "Error de tirada"); }
    finally { setLoading(false); }
  }
  return (
    <>
      <button type="button" aria-label="Abrir lanzador de dados" title="Tirar dados"
        onClick={() => setOpen(true)}
        className="fixed bottom-0 right-0 z-40 h-20 w-20 text-amber-300 drop-shadow-xl transition hover:brightness-125">
        <svg viewBox="0 0 90 90" className="h-full w-full" aria-hidden="true">
          <path d="M90 0 V90 H0 Z" fill="#171321" stroke="#b68a45" strokeWidth="2"/>
          <g transform="translate(51 49)" fill="#30214b" stroke="#e8b96c" strokeWidth="1.7">
            <path d="M0 -29 L25 -13 L25 14 L0 29 L-25 14 L-25 -13 Z"/>
            <path d="M0 -29 L-13 -5 L0 29 L13 -5 Z" fill="#49326b"/>
            <path d="M-25 -13 L-13 -5 L-25 14 M25 -13 L13 -5 L25 14 M-13 -5 L13 -5" fill="none"/>
          </g>
          <text x="51" y="57" textAnchor="middle" fill="#ffdf9a" fontSize="17" fontWeight="bold">20</text>
        </svg>
      </button>
      {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-2 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Lanzador de dados" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-600/50 bg-zinc-950 p-5 text-zinc-100 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-amber-200">🎲 Dados de Xahya</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded px-2 py-1 text-xl text-zinc-400 hover:text-white">×</button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Todas las tiradas se guardan en el auditor.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setMode("probability"); setResult(null); }} className={`rounded-lg border p-2 ${mode === "probability" ? "border-amber-400 bg-amber-900/30" : "border-zinc-700"}`}>Probabilidad</button>
            <button type="button" onClick={() => { setMode("free"); setResult(null); }} className={`rounded-lg border p-2 ${mode === "free" ? "border-amber-400 bg-amber-900/30" : "border-zinc-700"}`}>Tirada libre</button>
          </div>
          <label className="mt-4 block text-sm text-zinc-300">Personaje (opcional)
            <select className={`mt-1 ${field}`} value={characterId} onChange={e => setCharacterId(e.target.value)}>
              <option value="">Mi usuario</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {mode === "probability" ? <div className="mt-4">
            <div className="flex justify-between text-sm"><label htmlFor="dice-chance">Probabilidad</label><span>{chance}%</span></div>
            <input id="dice-chance" type="range" min="0" max="100" value={chance} onChange={e => setChance(Number(e.target.value))} className="w-full accent-amber-400"/>
            <p className="mt-2 text-sm text-zinc-300">Límites de probabilidad</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <label className="text-xs">Mínimo: {min}%
                <input aria-label="Límite mínimo" type="range" min="0" max={max} value={min} onChange={e => setMin(Number(e.target.value))} className="w-full accent-amber-400"/>
              </label>
              <label className="text-xs">Máximo: {max}%
                <input aria-label="Límite máximo" type="range" min={min} max="100" value={max} onChange={e => setMax(Number(e.target.value))} className="w-full accent-amber-400"/>
              </label>
            </div>
            <p className="mt-2 text-center text-sm text-amber-200">Probabilidad efectiva: {Math.max(min, Math.min(max, chance))}%</p>
          </div> : <div className="mt-4 grid grid-cols-3 gap-2">
            <label className="text-xs">Dado
              <select className={`mt-1 ${field}`} value={sides} onChange={e => setSides(Number(e.target.value))}>
                {faces.map(n => <option key={n} value={n}>d{n}</option>)}
              </select>
            </label>
            <label className="text-xs">Cantidad
              <input className={`mt-1 ${field}`} type="number" min="1" max="20" value={count} onChange={e => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}/>
            </label>
            <label className="text-xs">Modificador
              <input className={`mt-1 ${field}`} type="number" min="-1000" max="1000" value={modifier} onChange={e => setModifier(Math.max(-1000, Math.min(1000, Number(e.target.value) || 0)))}/>
            </label>
          </div>}
          <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-amber-900/50 bg-gradient-to-b from-violet-950/60 to-zinc-950 p-4">
            <svg viewBox="0 0 140 140" aria-label="Dado de cien caras" className={`h-32 w-32 ${loading ? "animate-spin" : ""}`} style={loading ? {animationDuration:"0.65s"} : undefined}>
              <path d="M70 6 L121 37 L121 100 L70 134 L19 100 L19 37 Z" fill="#33234e" stroke="#e9bc72" strokeWidth="3"/>
              <path d="M70 6 L44 55 L70 134 L96 55 Z" fill="#49336f" stroke="#e9bc72" strokeWidth="2"/>
              <path d="M19 37 L44 55 L19 100 M121 37 L96 55 L121 100 M44 55 L96 55" fill="none" stroke="#e9bc72" strokeWidth="2"/>
              <text x="70" y="87" fill="#ffe3a5" textAnchor="middle" fontSize="29" fontWeight="bold">{loading ? "?" : result ? result.rolls[0] : "100"}</text>
            </svg>
            <p className="mt-2 text-center text-lg font-semibold text-amber-200">{loading ? "Lanzando…" : result ? `Total: ${result.total}` : "Listo para lanzar"}</p>
            {result && <p className="text-center text-sm text-zinc-300">{result.rolls.length > 1 ? `Dados: ${result.rolls.join(", ")}` : ""}{result.success === null ? "" : result.success ? " ¡Éxito!" : " Falló la prueba"}</p>}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          <button type="button" disabled={loading} onClick={roll} className="mt-4 w-full rounded-xl bg-amber-700 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-50">🎲 {loading ? "Registrando…" : "Lanzar dados"}</button>
          {history.length > 0 && <div className="mt-4"><h3 className="text-sm text-zinc-400">Tiradas recientes de esta sesión</h3>
            <div className="mt-2 flex flex-wrap gap-2">{history.map((h,i) => <span key={i} className="rounded border border-zinc-700 px-2 py-1 text-xs">d{h.sides}: {h.total} · {h.when}</span>)}</div>
          </div>}
        </section>
      </div>}
    </>
  );
}
