import Link from "next/link";
import CasinoStaffBanner from "./CasinoStaffBanner";

const games = [
  {
    href: "/casino/roulette",
    icon: "🎰",
    title: "Ruleta",
    description: "Apuesta dinero, consume 1 karma y prueba tu suerte.",
    available: true,
  },
  {
    href: "/casino/blackjack",
    icon: "🃏",
    title: "Blackjack",
    description: "Llega a 21 sin pasarte. Pedir o plantarte; cada partida cuesta 1 karma.",
    available: true,
  },
  {
    href: "/casino/dice",
    icon: "🎲",
    title: "Dados",
    description: "Lanza un D20 y elige entre número exacto, alto/bajo, par/impar o rango.",
    available: true,
  },
];

export default function CasinoPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-zinc-500 transition hover:text-white">
            ← Xahya
          </Link>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Xahya</p>
            <h1 className="text-3xl font-bold">Caosino</h1>
          </div>
        </div>

        <section className="mt-8">
          <CasinoStaffBanner />
        </section>

        <section className="mt-12 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-600">Salón de juegos</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Elige tu juego
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-500">
            Cada minijuego tendrá sus propias reglas, recompensas y mecánicas.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {games.map((game) => (
            game.available ? (
              <Link
                key={game.title}
                href={game.href}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 transition hover:-translate-y-1 hover:border-amber-400/50 hover:bg-zinc-900"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-4xl">
                  {game.icon}
                </div>
                <h3 className="mt-6 text-2xl font-bold group-hover:text-amber-300">{game.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{game.description}</p>
                <p className="mt-6 text-sm font-semibold text-amber-300">Jugar →</p>
              </Link>
            ) : (
              <div
                key={game.title}
                className="rounded-2xl border border-zinc-900 bg-zinc-900/30 p-6 opacity-50"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-4xl grayscale">
                  {game.icon}
                </div>
                <h3 className="mt-6 text-2xl font-bold">{game.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{game.description}</p>
              </div>
            )
          ))}
        </section>

        <div className="mt-10 text-center">
          <Link href="/characters" className="text-sm text-zinc-600 transition hover:text-zinc-300">
            Ver mis personajes
          </Link>
        </div>
      </div>
    </main>
  );
}
