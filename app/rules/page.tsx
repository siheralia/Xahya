"use client";

import { useEffect, useState } from "react";
import { WhatsAppMarkup } from "@/components/WhatsAppMarkup";

type Rule = {
  id: number;
  title: string;
  content: string;
};

type KarmaRank = {
  id: number;
  name: string;
  flair: string | null;
  karma: number;
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [karmaRanking, setKarmaRanking] = useState<KarmaRank[]>([]);
  const [karmaLoading, setKarmaLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rules", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las reglas.");
        setRules(Array.isArray(data.rules) ? data.rules : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las reglas."))
      .finally(() => setLoading(false));

    fetch("/api/rankings/karma", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar el ranking de karma.");
        setKarmaRanking(Array.isArray(data.ranking) ? data.ranking : []);
      })
      .catch(() => setKarmaRanking([]))
      .finally(() => setKarmaLoading(false));
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

        <section className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/70">Ranking de karma</p>
            <h2 className="mt-1 text-2xl font-semibold">Los más famosos de Xahya</h2>
            <p className="mt-1 text-sm text-zinc-500">Las 3 personas con más karma de Xahya.</p>
          </div>

          {karmaLoading ? (
            <p className="mt-5 text-sm text-zinc-500">Cargando ranking...</p>
          ) : karmaRanking.length === 0 ? (
            <p className="mt-5 text-sm text-zinc-500">Aún no hay personajes en el ranking.</p>
          ) : (
            <div className="mt-5 grid gap-2">
              {karmaRanking.map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                  <span className="w-6 text-sm font-bold text-zinc-500">#{index + 1}</span>
                  <span className="text-lg">{entry.flair ?? "✦"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                  <span className="shrink-0 font-semibold text-amber-200">{entry.karma.toLocaleString("en-US")} 🪷</span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-zinc-600">Quienes posean el Velo de Karma pueden ocultarse de este ranking público.</p>
        </section>

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
                <div className="mt-5">
                  <WhatsAppMarkup text={rule.content} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
