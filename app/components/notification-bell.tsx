"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCount(Number(data.unreadCount) || 0))
      .catch(() => {});
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={count ? `Buzón: ${count} notificaciones sin leer` : "Buzón"}
      className="fixed right-4 top-4 z-50 rounded-full border border-zinc-800 bg-zinc-950/90 px-4 py-2 text-sm text-zinc-300 shadow-lg backdrop-blur transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
    >
      🔔 Buzón
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-yellow-300 px-1.5 py-0.5 text-center text-[10px] font-bold text-zinc-950">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}