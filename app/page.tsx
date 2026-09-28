import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { db } from "@/lib/db";

const sakuraPetals = Array.from({ length: 24 }, (_, index) => index);

export default async function Home() {
  const { userId: clerkId } = await auth();
  let isManagementUser = false;
  let databaseOnline = true;

  try {
    const users = await db.orm.public.User.all();

    if (clerkId) {
      const user = users.find((candidate) => candidate.clerkId === clerkId);
      isManagementUser = user ? ["GM", "ADMIN"].includes(String(user.role)) : false;
    }
  } catch {
    databaseOnline = false;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      <style>{`
        .sakura-layer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .sakura-petal {
          position: absolute;
          top: -12%;
          left: 0;
          width: 12px;
          height: 17px;
          border-radius: 70% 25% 70% 25%;
          background: #f4a7bd;
          opacity: 0;
          transform: rotate(25deg);
          animation: sakura-fall linear infinite;
        }

        .sakura-petal::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 15%;
          width: 1px;
          height: 70%;
          background: rgba(255,255,255,.35);
          transform: rotate(18deg);
          transform-origin: center;
        }

        .sakura-petal:nth-child(1) { left: 3%; animation-duration: 10s; animation-delay: -2s; transform: scale(.65) rotate(15deg); }
        .sakura-petal:nth-child(2) { left: 8%; animation-duration: 14s; animation-delay: -8s; transform: scale(.9) rotate(65deg); }
        .sakura-petal:nth-child(3) { left: 13%; animation-duration: 11s; animation-delay: -5s; transform: scale(.5) rotate(120deg); }
        .sakura-petal:nth-child(4) { left: 18%; animation-duration: 16s; animation-delay: -12s; transform: scale(.75) rotate(35deg); }
        .sakura-petal:nth-child(5) { left: 24%; animation-duration: 12s; animation-delay: -4s; transform: scale(.55) rotate(90deg); }
        .sakura-petal:nth-child(6) { left: 29%; animation-duration: 15s; animation-delay: -10s; transform: scale(.8) rotate(155deg); }
        .sakura-petal:nth-child(7) { left: 35%; animation-duration: 13s; animation-delay: -7s; transform: scale(.6) rotate(45deg); }
        .sakura-petal:nth-child(8) { left: 40%; animation-duration: 17s; animation-delay: -14s; transform: scale(.95) rotate(80deg); }
        .sakura-petal:nth-child(9) { left: 46%; animation-duration: 11s; animation-delay: -3s; transform: scale(.5) rotate(170deg); }
        .sakura-petal:nth-child(10) { left: 51%; animation-duration: 14s; animation-delay: -9s; transform: scale(.7) rotate(25deg); }
        .sakura-petal:nth-child(11) { left: 57%; animation-duration: 16s; animation-delay: -6s; transform: scale(.55) rotate(110deg); }
        .sakura-petal:nth-child(12) { left: 62%; animation-duration: 12s; animation-delay: -11s; transform: scale(.85) rotate(60deg); }
        .sakura-petal:nth-child(13) { left: 67%; animation-duration: 15s; animation-delay: -2s; transform: scale(.65) rotate(145deg); }
        .sakura-petal:nth-child(14) { left: 72%; animation-duration: 10s; animation-delay: -7s; transform: scale(.5) rotate(30deg); }
        .sakura-petal:nth-child(15) { left: 77%; animation-duration: 17s; animation-delay: -13s; transform: scale(.9) rotate(100deg); }
        .sakura-petal:nth-child(16) { left: 82%; animation-duration: 13s; animation-delay: -5s; transform: scale(.6) rotate(20deg); }
        .sakura-petal:nth-child(17) { left: 87%; animation-duration: 14s; animation-delay: -10s; transform: scale(.75) rotate(135deg); }
        .sakura-petal:nth-child(18) { left: 92%; animation-duration: 11s; animation-delay: -4s; transform: scale(.5) rotate(70deg); }
        .sakura-petal:nth-child(19) { left: 96%; animation-duration: 16s; animation-delay: -12s; transform: scale(.8) rotate(165deg); }
        .sakura-petal:nth-child(20) { left: 20%; animation-duration: 18s; animation-delay: -16s; transform: scale(.45) rotate(50deg); }
        .sakura-petal:nth-child(21) { left: 43%; animation-duration: 19s; animation-delay: -15s; transform: scale(.7) rotate(125deg); }
        .sakura-petal:nth-child(22) { left: 64%; animation-duration: 18s; animation-delay: -9s; transform: scale(.5) rotate(15deg); }
        .sakura-petal:nth-child(23) { left: 79%; animation-duration: 19s; animation-delay: -17s; transform: scale(.65) rotate(95deg); }
        .sakura-petal:nth-child(24) { left: 90%; animation-duration: 15s; animation-delay: -14s; transform: scale(.55) rotate(40deg); }

        @keyframes sakura-fall {
          0% { top: -12%; opacity: 0; margin-left: 0; }
          8% { opacity: .8; }
          30% { margin-left: 35px; transform: rotate(120deg); }
          55% { margin-left: -30px; transform: rotate(240deg); }
          80% { margin-left: 25px; transform: rotate(330deg); }
          100% { top: 112%; margin-left: -15px; opacity: 0; transform: rotate(450deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sakura-petal { animation: none; opacity: .35; top: 18%; }
          .sakura-petal:nth-child(n+13) { display: none; }
        }
      `}</style>

      <div className="sakura-layer" aria-hidden="true">
        {sakuraPetals.map((petal) => (
          <span className="sakura-petal" key={petal} />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Xahya</h1>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-sm ${
                databaseOnline
                  ? "border-emerald-400/30 text-emerald-300"
                  : "border-red-400/30 text-red-300"
              }`}
              title={databaseOnline ? "El sistema responde correctamente" : "El sistema no responde"}
            >
              <span className="mr-1.5">●</span>
              Sistema {databaseOnline ? "en línea" : "desconectado"}
            </span>

            <Link
              href="/profile"
              className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
            >
              Mi perfil
            </Link>

            {isManagementUser ? (
              <Link
                href="/management"
                className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
              >
                RPG System
              </Link>
            ) : null}
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-zinc-500">
            Xahya Character System
          </p>

          <h2 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
            Tu personaje.
            <br />
            Tus estadísticas.
            <br />
            Un solo sistema.
          </h2>

          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
            Xahya centraliza tus personajes, estadísticas, recursos y sistemas de juego en un solo lugar.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/characters/create"
              className="rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200"
            >
              Crear personaje
            </Link>

            <Link
              href="/characters"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-white transition hover:bg-zinc-900"
            >
              Ver personajes
            </Link>

            <Link
              href="/casino"
              className="rounded-lg border border-amber-500/40 px-6 py-3 font-medium text-amber-300 transition hover:bg-amber-400/10"
            >
              🎰 Casino
            </Link>

            {isManagementUser && (
              <Link
                href="/management"
                className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-white transition hover:bg-zinc-900"
              >
                Gestión GM / Admin
              </Link>
            )}
          </div>
        </section>

        <footer className="border-t border-zinc-900 pt-6 text-sm text-zinc-600">
          Xahya — Sistema de gestión de personajes y RPG
        </footer>
      </div>
    </main>
  );
}
