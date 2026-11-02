"use client";

import { useEffect, useId, useState } from "react";
import type { CopyMode } from "@/lib/skills/copy";

type CopySource = {
  id: number;
  name: string;
  characterName: string;
  complexityPch: number;
};
type Props = {
  characterId: number;
  copierSkillId: number;
  mode: CopyMode;
  busy: boolean;
  refreshKey?: number;
  onCopy: (sourceSkillId: number) => void | Promise<void>;
};

export function SkillCopySourceSearch({
  characterId, copierSkillId, mode, busy, refreshKey = 0, onCopy,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CopySource[]>([]);
  const [selected, setSelected] = useState<CopySource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setLoading(false);
      setResults([]);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const url = "/api/characters/" + characterId + "/skills/copies/search?" +
          new URLSearchParams({ q: query.trim(), copierSkillId: String(copierSkillId), mode }).toString();
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "No se pudo buscar habilidades.");
        if (controller.signal.aborted) return;
        setResults(Array.isArray(data.skills) ? data.skills : []);
        setSelected(current => data.skills?.some((skill: CopySource) => skill.id === current?.id) ? current : null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Error al buscar habilidades.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [characterId, copierSkillId, mode, query, refreshKey]);

  return <div className="mt-2 space-y-2">
    <label htmlFor={id} className="block text-xs text-zinc-300">Buscar habilidad original por nombre</label>
    <input
      id={id}
      type="search"
      value={query}
      maxLength={80}
      placeholder="Escribe al menos 2 letras…"
      autoComplete="off"
      onChange={event => {
        setQuery(event.target.value);
        setSelected(null);
        setResults([]);
        setError("");
      }}
      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
    />
    <div className="text-xs text-zinc-400" aria-live="polite">
      {loading ? "Buscando…" : error || (query.trim().length < 2
        ? "Busca por nombre; solo aparecen habilidades aprobadas compatibles con esta copia."
        : results.length === 0 ? "No hay habilidades compatibles con ese nombre." : results.length + " resultados")}
    </div>
    {results.length > 0 && <ul aria-label="Habilidades encontradas" className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-zinc-700 p-1">
      {results.map(skill => <li key={skill.id}>
        <button
          type="button"
          disabled={busy}
          aria-pressed={selected?.id === skill.id}
          onClick={() => setSelected(skill)}
          className={"w-full rounded-md px-3 py-2 text-left text-xs disabled:opacity-50 " +
            (selected?.id === skill.id ? "border border-violet-400 bg-violet-900/40 text-white" : "hover:bg-zinc-800 text-zinc-200")}
        >
          <span className="block font-semibold">{skill.name}</span>
          <span className="block text-zinc-400">{skill.characterName} · {skill.complexityPch} PCH de complejidad</span>
        </button>
      </li>)}
    </ul>}
    {selected && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-600/40 bg-violet-950/20 p-2">
      <span className="min-w-0 text-xs text-violet-200">Seleccionada: {selected.name} ({selected.characterName})</span>
      <button
        type="button"
        onClick={() => onCopy(selected.id)}
        disabled={busy}
        className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >{busy ? "Copiando…" : mode === "IMITATION" ? "Imitar habilidad" : "Copiar habilidad"}</button>
    </div>}
  </div>;
}
