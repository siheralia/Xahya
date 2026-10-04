"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Event = {
  id: string;
  action: string;
  characterId: number | null;
  characterName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

const labels: Record<string, string> = {
  GLOBAL_REWARD: "Entrega global",
  RESOURCE_GRANT: "Recibiste recursos",
  LEVEL_UP: "Cambios de Level Up",
  KARMA_BOOST: "Boost de Karma",
  STAT_UPDATE: "Estadísticas actualizadas",
  CHARACTER_RENAME: "Personaje renombrado",
  CHARACTER_TRANSFER: "Personaje transferido",
  CHARACTER_DELETE: "Personaje eliminado",
};

function description(event: Event) {
  const d = event.details ?? {};
  if (event.action === "GLOBAL_REWARD") {
    const parts: string[] = [];
    for (const [key, label] of [["karma","Karma"],["money","dinero"],["levelUpPoints","Level Up"]] as const) {
      const value = Number(d[key] ?? 0);
      if (value) parts.push(`${value > 0 ? "+" : ""}${value} ${label}`);
    }
    return parts.length ? `Se aplicó globalmente: ${parts.join(", ")}.` : "Se aplicó una entrega global.";
  }
  if (event.action === "RESOURCE_GRANT") {
    const parts: string[] = [];
    const money = Number(d.money ?? 0);
    const karma = Number(d.karma ?? 0);
    const levelUpPoints = Number(d.levelUpPoints ?? 0);
    const statLabels: Record<string, string> = {
      strength: "Fuerza", agility: "Agilidad", constitution: "Constitución",
      intelligence: "Inteligencia", wisdom: "Sabiduría", charisma: "Carisma",
      spirit: "Espíritu", luck: "Suerte",
    };
    if (money) parts.push(`${money > 0 ? "+" : ""}${money.toLocaleString("es-MX")} dinero`);
    if (karma) parts.push(`${karma > 0 ? "+" : ""}${karma} karma 🪷`);
    if (levelUpPoints) parts.push(`${levelUpPoints > 0 ? "+" : ""}${levelUpPoints} puntos de Level Up`);
    const stats = d.stats && typeof d.stats === "object" ? d.stats as Record<string, unknown> : {};
    for (const [stat, label] of Object.entries(statLabels)) {
      const value = Number(stats[stat] ?? 0);
      if (value) parts.push(`${value > 0 ? "+" : ""}${value} ${label}`);
    }
    return parts.length ? `Recibiste: ${parts.join(", ")}.` : "Recibiste recursos.";
  }
  if (d.amount !== undefined) return `Cantidad: ${String(d.amount)}`;
  if (d.before !== undefined && d.after !== undefined) return `${String(d.before)} → ${String(d.after)}`;
  return labels[event.action] ?? "Hubo una novedad en tu personaje.";
}

function date(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => {
        setLoading(false);
        fetch("/api/notifications", { method: "POST" }).catch(() => {});
      });
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">← Inicio</Link>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Buzón</h1>
            <p className="mt-2 text-zinc-500">Novedades relevantes de tus personajes.</p>
          </div>
          <span className="text-2xl" aria-hidden="true">🔔</span>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-500">Cargando novedades…</div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-medium">Todo tranquilo</p>
              <p className="mt-2 text-sm text-zinc-500">No hay novedades registradas para tus personajes.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {items.map((item) => (
                <article key={item.id} className="px-6 py-5 hover:bg-zinc-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-yellow-300">{labels[item.action] ?? "Novedad"}</p>
                      <p className="mt-1 text-white">
                        {item.characterName ? item.characterName : "Tus personajes"}
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">{description(item)}</p>
                    </div>
                    <time className="text-xs text-zinc-600">{date(item.createdAt)}</time>
                  </div>
                  {item.characterId ? (
                    <Link href={`/characters/${item.characterId}`} className="mt-4 inline-block rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">
                      Ir a ver
                    </Link>
                  ) : (
                    <Link href="/characters" className="mt-4 inline-block rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">
                      Ir a ver
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
