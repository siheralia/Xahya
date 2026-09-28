"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type Reward = {
  activityEvents: number;
  updatedCharacters: number;
};

export default function ReturnRewardNotice() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const [reward, setReward] = useState<Reward | null>(null);
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
        return response.json() as Promise<Reward & { show?: boolean }>;
      })
      .then((data) => {
        if (!cancelled && data?.show) {
          setReward({
            activityEvents: Number(data.activityEvents) || 0,
            updatedCharacters: Number(data.updatedCharacters) || 0,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, sessionId]);

  if (!reward || closed) return null;

  return (
    <aside
      className="fixed bottom-5 right-5 z-50 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-yellow-400/80 bg-zinc-950/95 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-2xl" aria-hidden="true">🪷</div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-yellow-300">
            Recompensa de regreso
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Desde tu última entrada hubo {reward.activityEvents}{" "}
            {reward.activityEvents === 1 ? "evento" : "eventos"} en tus personajes.
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            Se agregaron +5 Karma a {reward.updatedCharacters}{" "}
            {reward.updatedCharacters === 1 ? "personaje" : "personajes"}.
          </p>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Link
              href="/characters"
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
