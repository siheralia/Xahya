"use client";

import { useEffect, useState } from "react";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar el perfil.");
        return data;
      })
      .then((data) => {
        setName(data.name);
        setEmail(data.email);
        setRole(data.role);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar el perfil."))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar el nombre.");

      setName(data.name);
      setMessage("Nombre actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el nombre.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-zinc-950 p-12 text-white">Cargando perfil...</main>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-xl px-6 py-6">
        <h1 className="text-4xl font-bold">Mi perfil</h1>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {message && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{message}</div>}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="block">
            <span className="text-sm text-zinc-400">Nombre</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500"
            />
          </label>

          <div className="mt-5 text-sm text-zinc-500">
            <p>Correo: <span className="text-zinc-300">{email}</span></p>
            <p className="mt-2">Rol: <span className="text-zinc-300">{role}</span></p>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="mt-6 w-full rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar nombre"}
          </button>
        </section>
      </div>
    </main>
  );
}
