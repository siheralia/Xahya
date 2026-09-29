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
  notifications: { label: "Buzón", color: "text-yellow-300/70" },
  "": { label: "Inicio", color: "text-zinc-500" },
};

function getRouteInfo(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const sectionKey = parts[0] ?? "";
  const section = sectionMap[sectionKey] ?? { label: "Xahya", color: "text-zinc-500" };

  let backHref: string | null = null;
  let backLabel = "";

  if (parts.length >= 2) {
    backHref = `/${parts.slice(0, -1).join("/")}`;
    backLabel =
      sectionKey === "characters" ? "Personajes" :
      sectionKey === "casino" ? "Casino" :
      section.label;
  } else if (sectionKey === "characters" || sectionKey === "casino" || sectionKey === "profile" || sectionKey === "management" || sectionKey === "notifications") {
    backHref = "/";
    backLabel = "Inicio";
  }

  const page = parts.length === 0
    ? "Inicio"
    : parts.length === 1
      ? section.label
      : decodeURIComponent(parts[parts.length - 1])
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

  return { section, page, backHref, backLabel };
}

export default function NavigationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isManagement, setIsManagement] = useState(false);
  const route = useMemo(() => getRouteInfo(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/characters", { cache: "no-store" }).then((r) => r.ok ? r.json() : []),
      fetch("/api/profile", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([chars, profile]) => {
      if (cancelled) return;
      setCharacters(Array.isArray(chars) ? chars : []);
      setIsManagement(["GM", "ADMIN"].includes(String(profile?.role ?? "")));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="xahya-nav">
        <div className="xahya-nav-left">
          <Link href="/" className="xahya-brand" aria-label="Ir al inicio de Xahya">
            <img src="/sakura-petal.svg" alt="" className="xahya-logo" />
            <span>Xahya</span>
          </Link>

          {route.backHref && (
            <Link href={route.backHref} className="xahya-back">
              ← {route.backLabel}
            </Link>
          )}

          <nav className="xahya-user-nav" aria-label="Navegación de usuario">
            {isManagement && (
              <Link href="/management" className={pathname.startsWith("/management") ? "xahya-nav-active" : ""}>
                Management
              </Link>
            )}
            <Link href="/profile" className={pathname === "/profile" ? "xahya-nav-active" : ""}>
              Mi perfil
            </Link>
          </nav>

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
        </div>

        <div className="xahya-nav-right">
          <span className={`xahya-section ${route.section.color}`}>{route.section.label}</span>
          <span className="xahya-breadcrumb">
            {route.section.label}<span className="text-zinc-700"> &gt; </span>{route.page}
          </span>
        </div>
      </header>

      <div className="xahya-page-content">{children}</div>

      <Link href="/casino" className="xahya-casino">
        🎰 <span>Casino</span>
      </Link>
    </>
  );
}
