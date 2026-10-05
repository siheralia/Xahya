"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Character = { id: number; name: string };

const sectionMap: Record<string, { label: string; color: string }> = {
  casino: { label: "Casino", color: "text-amber-300/70" },
  characters: { label: "Personajes", color: "text-cyan-300/70" },
  profile: { label: "Perfil", color: "text-violet-300/70" },
  management: { label: "Management", color: "text-rose-300/70" },
  store: { label: "Tienda", color: "text-emerald-300/70" },
  businesses: { label: "Negocios", color: "text-emerald-300/70" },
  maze: { label: "Laberinto", color: "text-fuchsia-300/70" },
  notifications: { label: "Buzón", color: "text-yellow-300/70" },
  rules: { label: "Reglas", color: "text-rose-300/70" },
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

  const page = character ? character.name : (
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

export default function NavigationShell({
  children,
  canManage,
}: {
  children: React.ReactNode;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemOnline, setSystemOnline] = useState(true);
  const route = useMemo(() => getRouteInfo(pathname, characters), [pathname, characters]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/characters", { cache: "no-store" }),
      fetch("/api/notifications", { cache: "no-store" }),
    ]).then(async ([charactersResponse, notificationsResponse]) => {
      if (cancelled) return;

      setSystemOnline(charactersResponse.ok);
      
      const [chars, notifications] = await Promise.all([
        charactersResponse.ok ? charactersResponse.json() : Promise.resolve([]),
        notificationsResponse.ok ? notificationsResponse.json() : Promise.resolve(null),
      ]);

      setCharacters(Array.isArray(chars) ? chars : []);
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
        <div className="xahya-nav-top">
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

          <div className="xahya-nav-right">
            <span className={`xahya-section ${route.section.color}`}>{route.section.label}</span>
            {showPageBreadcrumb && (
              <span className="xahya-breadcrumb">{route.page}</span>
            )}
          </div>
        </div>

        <div className="xahya-nav-bottom">
          <details className="xahya-menu">
            <summary aria-label="Abrir menú de navegación">☰</summary>
            <nav
              className="xahya-menu-panel"
              aria-label="Navegación principal"
              onClick={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("a")) {
                  target.closest("details")?.removeAttribute("open");
                }
              }}
            >
              <Link href="/profile" className={pathname === "/profile" ? "xahya-nav-active" : ""}>
                Mi perfil
              </Link>
              <Link href="/businesses/catalog" className={pathname.startsWith("/businesses") ? "xahya-nav-active" : ""}>
                Negocios
              </Link>
              <Link href="/store" className={pathname.startsWith("/store") ? "xahya-nav-active" : ""}>
                Tienda
              </Link>
              <Link href="/maze" className={pathname.startsWith("/maze") ? "xahya-nav-active" : ""}>
                Laberinto
              </Link>
              <Link href="/casino" className={pathname.startsWith("/casino") ? "xahya-nav-active" : ""}>
                Casino
              </Link>
              {canManage && (
                <Link href="/management" className={pathname.startsWith("/management") ? "xahya-nav-active" : ""}>
                  Gestión
                </Link>
              )}
            </nav>
          </details>

          <nav className="xahya-utility-nav" aria-label="Ayuda y comunicación">
            <Link href="/help">❔ <span>Ayuda</span></Link>
            <Link href="/rules">📖 <span>Reglas</span></Link>
            <Link
              href="/notifications"
              aria-label={unreadCount ? `Buzón: ${unreadCount} notificaciones sin leer` : "Buzón"}
            >
              🔔 <span>Buzón</span>
              {unreadCount > 0 ? (
                <span className="xahya-inbox-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
              ) : null}
            </Link>
          </nav>
        </div>

        {characters.length > 0 && (
          <details className="xahya-characters">
            <summary>Tus personajes</summary>
            <div className="xahya-character-list">
              {characters.map((character) => (
                <Link key={character.id} href={`/characters/${character.id}`}>
                  {character.name}
                </Link>
              ))}
            </div>
          </details>
        )}
      </header>

      <div className="xahya-page-content">{children}</div>

    </>
  );
}
