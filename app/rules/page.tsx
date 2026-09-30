"use client";

import { useEffect, useState } from "react";

type Rule = {
  id: number;
  title: string;
  content: string;
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/rules", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las reglas.");
        setRules(Array.isArray(data.rules) ? data.rules : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las reglas."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300/70">Xahya</p>
          <h1 className="mt-2 text-4xl font-bold">Reglas</h1>
          <p className="mt-2 text-zinc-500">Consulta las reglas generales del sistema y las normas de cada apartado.</p>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}

        {loading ? (
          <p className="mt-8 text-zinc-500">Cargando reglas...</p>
        ) : rules.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
            Aún no hay reglas publicadas.
          </div>
        ) : (
          <div className="mt-8 grid gap-5">
            {rules.map((rule) => (
              <article key={rule.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <h2 className="text-2xl font-semibold">{rule.title}</h2>
                <div className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-zinc-300">
                  {rule.content}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
