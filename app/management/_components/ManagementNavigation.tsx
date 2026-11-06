import Link from "next/link";
import {
  Coins,
  Package,
  ShieldCheck,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";

type LinkTone = "neutral" | "cyan" | "amber" | "emerald" | "violet" | "fuchsia";

type ManagementLink = {
  label: string;
  href: string;
  permissions: readonly string[];
  tone?: LinkTone;
  staffOnly?: boolean;
  ariaLabel?: string;
  featured?: boolean;
};

type ManagementGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  iconColor: string;
  links: readonly ManagementLink[];
};

// Conservar las rutas y las condiciones de acceso del índice de Gestión.
const groups: readonly ManagementGroup[] = [
  {
    id: "system",
    title: "Sistema y administración",
    icon: ShieldCheck,
    iconColor: "text-zinc-300",
    links: [
      { label: "Registros", href: "/management/logs", permissions: ["logs"] },
      { label: "Rankings", href: "/management/rankings", permissions: ["rankings"] },
      { label: "Reglas", href: "/management/rules", permissions: ["rules"] },
      { label: "Roles", href: "/management/roles", permissions: ["roles"], tone: "cyan" },
      { label: "Usuarios", href: "/management/users", permissions: ["users"] },
      { label: "Ambientaciones", href: "/management/ambientations", permissions: ["ambientations"], tone: "fuchsia", staffOnly: true },
      { label: "Elementos", href: "/management/elements", permissions: ["elements"], tone: "cyan" },
    ],
  },
  {
    id: "adventures",
    title: "Mundo y aventuras",
    icon: Swords,
    iconColor: "text-violet-300",
    links: [
      { label: "Laberintos", href: "/management/maze", permissions: ["labyrinth"] },
      { label: "Enemigos", href: "/management/enemies", permissions: ["enemies"], staffOnly: true },
      { label: "Temáticas", href: "/management/themes", permissions: ["themes"], staffOnly: true },
      { label: "Relaciones sociales", href: "/management/social", permissions: ["social"] },
    ],
  },
  {
    id: "characters",
    title: "Personajes y habilidades",
    icon: Sparkles,
    iconColor: "text-violet-300",
    links: [
      { label: "Razas", href: "/management/races", permissions: ["races"], tone: "violet" },
      { label: "Perks", href: "/management/perks", permissions: ["perks"] },
      { label: "Habilidades", href: "/management/skills", permissions: ["skills"] },
      { label: "Estadísticas", href: "/management/statistics", permissions: ["statistics"], tone: "cyan" },
      { label: "Efectos", href: "/management/effects", permissions: ["effects"], tone: "cyan" },
      {
        label: "Edición y entregas",
        ariaLabel: "Edición y entregas de personajes",
        href: "/management/character-tools",
        permissions: ["characters", "character-resources", "character-details", "global-delivery"],
        tone: "cyan",
        featured: true,
      },
    ],
  },
  {
    id: "objects",
    title: "Objetos y propiedades",
    icon: Package,
    iconColor: "text-cyan-300",
    links: [
      { label: "Objetos", href: "/management/items", permissions: ["items"] },
      { label: "Materiales", href: "/management/materials", permissions: ["materials", "items"], tone: "cyan" },
      { label: "Tipos", href: "/management/material-types", permissions: ["materials", "items"], tone: "cyan" },
    ],
  },
  {
    id: "economy",
    title: "Economía",
    icon: Coins,
    iconColor: "text-emerald-300",
    links: [
      { label: "Mundo", href: "/management/world", permissions: ["world"], tone: "cyan" },
      { label: "Tienda", href: "/management/store", permissions: ["store"], tone: "emerald" },
      { label: "Casino", href: "/management/casino", permissions: ["casino"], tone: "amber" },
      { label: "Negocios y empleos", href: "/management/businesses", permissions: ["businesses"], tone: "emerald" },
    ],
  },
];

const linkColors: Record<LinkTone, string> = {
  neutral: "border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white",
  cyan: "border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/30",
  amber: "border-amber-500/30 text-amber-300 hover:bg-amber-950/30",
  emerald: "border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30",
  violet: "border-violet-500/30 text-violet-300 hover:bg-violet-950/30",
  fuchsia: "border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-950/30",
};

export default function ManagementNavigation({
  allowedPages,
  isAdmin,
  isGM,
}: {
  allowedPages: readonly string[];
  isAdmin: boolean;
  isGM: boolean;
}) {
  const canSee = (permission: string) => allowedPages.includes("management." + permission);
  const isStaff = isAdmin || isGM;

  return (
    <nav aria-label="Secciones de gestión" className="mt-7 grid items-start gap-x-5 gap-y-7 lg:grid-cols-2">
      {groups.map((group) => {
        const links = group.links.filter((link) =>
          (!link.staffOnly || isStaff) && link.permissions.some(canSee),
        );
        if (links.length === 0) return null;
        const Icon = group.icon;

        return (
          <section
            key={group.id}
            aria-labelledby={"management-section-" + group.id}
            className="relative min-w-0 rounded-2xl border border-zinc-700/70 bg-zinc-900/20 px-3 pb-4 pt-6 sm:px-4"
          >
            <div className="absolute inset-x-0 -top-3 flex justify-center px-2">
              <h2
                id={"management-section-" + group.id}
                className="inline-flex max-w-full items-center justify-center gap-2 bg-zinc-950 px-3 text-center text-sm font-semibold leading-6 text-zinc-200"
              >
                <Icon aria-hidden="true" className={"h-4 w-4 shrink-0 " + group.iconColor} />
                <span>{group.title}</span>
              </h2>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={link.ariaLabel}
                  className={
                    "inline-flex min-h-11 max-w-full items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-medium leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 " +
                    linkColors[link.tone ?? "neutral"] +
                    (link.featured ? " bg-cyan-950/30 font-semibold" : "")
                  }
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
