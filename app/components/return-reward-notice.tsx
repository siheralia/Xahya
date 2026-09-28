"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type Event = {
  id: string;
  action: string;
  characterId: number | null;
  characterName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

type NoticeData = {
  events: Event[];
};

const labels: Record<string, string> = {
  GLOBAL_REWARD: "Entrega global",
  RESOURCE_GRANT: "Recibiste recursos",
  LEVEL_UP: "Gastaste puntos de Level Up",
  KARMA_BOOST: "Aplicaste un boost de Karma",
  STAT_UPDATE: "Se modificaron estadísticas",
  CHARACTER_RENAME: "Tu personaje fue renombrado",
  CHARACTER_TRANSFER: "Tu personaje fue transferido",
  CHARACTER_DELETE: "Tu personaje fue eliminado",
  CASINO_ROULETTE: "Jugaste ruleta",
  CASINO_BLACKJACK: "Jugaste Blackjack",
  CASINO_DICE: "Jugaste dados",
};

function eventText(event: Event) {
  if (event.action === "GLOBAL_REWARD") {
    const karma = Number(event.details?.karma ?? 0);
    const money = Number(event.details?.money ?? 0);
    const levelUpPoints = Number(event.details?.levelUpPoints ?? 0);
    const parts: string[] = [];

    if (karma) parts.push(`${karma > 0 ? "+" : ""}${karma} Karma`);
    if (money) parts.push(`${money > 0 ? "+" : ""}${money} dinero`);
    if (levelUpPoints) parts.push(`${levelUpPoints > 0 ? "+" : ""}${levelUpPoints} Level Up`);

    return parts.length
      ? `Se aplicó globalmente: ${parts.join(", ")}.`
      : "Se aplicó una entrega global.";
  }

  return labels[event.action] ?? "Tu personaje tuvo una novedad.";
}

export default function ReturnRewardNotice() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;

    let cancelled = false;

    fetch("/api/session/login", {
      method: "POST",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<NoticeData & { show?: boolean }>;
      })
      .then((data) => {
        if (!cancelled && data?.show && data.events?.length) {
          setNotice({ events: data.events });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, sessionId]);

  if (!notice || closed) return null;

  const visibleEvents = notice.events.slice(0, 5);
  const extraCount = Math.max(0, notice.events.length - visibleEvents.length);
  const firstCharacterId = visibleEvents.find((event) => event.characterId)?.characterId;

  return (
    <aside
      className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-yellow-400/80 bg-zinc-950/95 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-2xl" aria-hidden="true">🪷</div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-yellow-300">
            ✨ Novedades de tus personajes
          </p>

          <div className="mt-3 space-y-2">
            {visibleEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <p className="text-sm font-medium text-white">
                  {event.characterName ? `${event.characterName} · ` : ""}
                  {eventText(event)}
                </p>
              </div>
            ))}
          </div>

          {extraCount > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              +{extraCount} novedades más.
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Link
              href={firstCharacterId ? `/characters/${firstCharacterId}` : "/characters"}
              onClick={() => setClosed(true)}
              className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-200"
            >
              Ir a ver
            </Link>
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
