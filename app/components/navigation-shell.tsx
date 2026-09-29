"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Character = { id: number; name: string; flair: string | null };

const sectionMap: Record<string, { label: string; color: string }> = {
  casino: { label: "Casino", color: "text-amber-300/70" },
  characters: { label: "Personajes", color: "text-cyan-300/70" },
  profile: { label: "Perfil", color: "text-violet-300/70" },
  management: { label: "Management", color: "text-rose-300/70" },
  store: { label: "Tienda", color: "text-emerald-300/70" },
  maze: { label: "Laberinto", color: "text-fuchsia-300/70" },
  notifications: { label: "Buzón", color: "text-yellow-300/70" },
  "": { label: "Inicio", color: "text-zinc-500" },
};

function getRouteInfo(pathname: string, characters: Character[]) {
  const parts = pathname.split("/").filter(Boolean);
  const sectionKey = parts[0] ?? "";
  const section = sectionMap[sectionKey] ?? { label: "Xahya", color: "text-zinc-500" };

  let backHref: string | null = null;
  let backLabel = "";

  if (parts.length >= 2 && !(sectionKey === "characters" && parts.length === 2)) {
    backHref = `/${parts.slice(0, -1).join("/")}`;
    backLabel =
      sectionKey === "characters" ? "Personajes" :
      sectionKey === "casino" ? "Casino" :
      section.label;
  }

  const character =
    sectionKey === "characters" && parts.length >= 2
      ? characters.find((item) => String(item.id) === parts[1])
      : undefined;

  const page = character ? character.name + (character.flair ? " ⟨" + character.flair + "⟩" : "") : (
    parts.length === 0
      ? "Inicio"
      : parts.length === 1
        ? section.label
        : decodeURIComponent(parts[parts.length - 1])
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
  );

  return { section, page, backHref, backLabel };
}

export default function NavigationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isManagement, setIsManagement] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemOnline, setSystemOnline] = useState(true);
  const route = useMemo(() => getRouteInfo(pathname, characters), [pathname, characters]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/characters", { cache: "no-store" }),
      fetch("/api/profile", { cache: "no-store" }),
      fetch("/api/notifications", { cache: "no-store" }),
    ]).then(async ([charactersResponse, profileResponse, notificationsResponse]) => {
      if (cancelled) return;

      setSystemOnline(charactersResponse.ok && profileResponse.ok);

      const [chars, profile, notifications] = await Promise.all([
        charactersResponse.ok ? charactersResponse.json() : Promise.resolve([]),
        profileResponse.ok ? profileResponse.json() : Promise.resolve(null),
        notificationsResponse.ok ? notificationsResponse.json() : Promise.resolve(null),
      ]);

      setCharacters(Array.isArray(chars) ? chars : []);
      setIsManagement(["GM", "ADMIN"].includes(String(profile?.role ?? "")));
      setUnreadCount(Number(notifications?.unreadCount) || 0);
    }).catch(() => {
      if (!cancelled) setSystemOnline(false);
    });

    return () => { cancelled = true; };
  }, []);

  const showPageBreadcrumb = route.page !== route.section.label;

  return (
    <>
      <header className="xahya-nav">
        <div className="xahya-nav-left">
          <div className="xahya-brand-row">
            <Link href="/" className="xahya-brand" aria-label="Ir al inicio de Xahya">
              <img src="/sakura-petal.svg" alt="" className="xahya-logo" />
              <span>Xahya</span>
            </Link>
            <span
              className={`xahya-system-status ${systemOnline ? "online" : "offline"}`}
              title={systemOnline ? "Sistema en línea" : "Sistema desconectado"}
              aria-label={systemOnline ? "Sistema en línea" : "Sistema desconectado"}
            >
              •
            </span>
          </div>

          {route.backHref && (
            <Link href={route.backHref} className="xahya-back">
              ← {route.backLabel}
            </Link>
          )}

          <nav className="xahya-user-nav" aria-label="Navegación de usuario">
            {isManagement && (
              <Link href="/management" className={pathname.startsWith("/management") ? "xahya-nav-active" : ""}>
                RPG System
              </Link>
            )}
            <Link href="/profile" className={pathname === "/profile" ? "xahya-nav-active" : ""}>
              Mi perfil
            </Link>
            <span aria-hidden="true" className="mx-2 text-zinc-600">|</span>
            <Link href="/store" className={pathname.startsWith("/store") ? "xahya-nav-active" : ""}>
              Tienda
            </Link>
            <span aria-hidden="true" className="mx-2 text-zinc-600">|</span>
            <Link href="/maze" className={pathname.startsWith("/maze") ? "xahya-nav-active" : ""}>
              Laberinto
            </Link>
          </nav>

          {characters.length > 0 && (
            <details className="xahya-characters">
              <summary>Tus personajes</summary>
              <div className="xahya-character-list">
                {characters.map((character) => (
                  <Link key={character.id} href={`/characters/${character.id}`}>
                    {character.name} {character.flair && <span className="text-xs text-zinc-500">⟨{character.flair}⟩</span>}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="xahya-nav-right">
          <span className={`xahya-section ${route.section.color}`}>{route.section.label}</span>
          {showPageBreadcrumb && (
            <span className="xahya-breadcrumb">{route.page}</span>
          )}
        </div>
      </header>

      <div className="xahya-page-content">{children}</div>

      <Link href="/casino" className="xahya-casino">
        🎰 <span>Casino</span>
      </Link>

      <Link
        href="/notifications"
        aria-label={unreadCount ? `Buzón: ${unreadCount} notificaciones sin leer` : "Buzón"}
        className="xahya-inbox"
      >
        🔔 <span>Buzón</span>
        {unreadCount > 0 ? (
          <span className="xahya-inbox-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </Link>
    </>
  );
}
