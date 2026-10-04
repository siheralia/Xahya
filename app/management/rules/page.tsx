"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WhatsAppMarkup } from "@/components/WhatsAppMarkup";

type Rule = {
  id: number;
  title: string;
  content: string;
  position: number;
  backgroundUrl: string | null;
  bannerUrl: string | null;
};

export default function RulesManagementPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/rules", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las reglas.");
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las reglas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!["GM", "ADMIN"].includes(String(data?.role ?? ""))) {
          window.location.replace("/rules");
          return;
        }
        setCheckingAccess(false);
        await load();
      })
      .catch(() => window.location.replace("/rules"));
  }, []);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setContent("");
  }

  async function save() {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    if (!cleanTitle || !cleanContent) {
      setError("Escribe un título y el contenido de las reglas.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(editingId ? `/api/rules/${editingId}` : "/api/rules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle, content: cleanContent }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron guardar las reglas.");

      resetForm();
      setSuccess(editingId ? "Sección actualizada correctamente." : "Sección creada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las reglas.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(ruleId: number, kind: "background" | "banner", file: File | undefined) {
    if (!file) return;
    setUploading(kind + "-" + ruleId);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("ruleId", String(ruleId));
      form.set("kind", kind);
      const response = await fetch("/api/management/rules/image", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo subir la imagen.");
      setSuccess(kind === "banner" ? "Banner actualizado." : "Fondo actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(null);
    }
  }

  async function removeImage(ruleId: number, kind: "background" | "banner") {
    setUploading(kind + "-" + ruleId);
    try {
      const response = await fetch("/api/management/rules/image?ruleId=" + ruleId + "&kind=" + kind, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo quitar la imagen.");
      setSuccess(kind === "banner" ? "Banner quitado." : "Fondo quitado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar la imagen.");
    } finally {
      setUploading(null);
    }
  }

  async function moveRule(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const ids = rules.map((rule) => rule.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      const response = await fetch("/api/rules/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cambiar el orden.");
      setSuccess("Orden actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el orden.");
    }
  }

  async function removeRule(id: number) {
    if (!window.confirm("¿Eliminar esta sección de reglas?")) return;

    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/rules/" + id, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar la sección.");
      if (editingId === id) resetForm();
      setSuccess("Sección eliminada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la sección.");
    }
  }

  function editRule(rule: Rule) {
    setEditingId(rule.id);
    setTitle(rule.title);
    setContent(rule.content);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">← Gestión</Link>
            <h1 className="mt-4 text-4xl font-bold">Reglas</h1>
            <p className="mt-2 text-zinc-500">Crea y administra las secciones de reglas que podrán consultar los jugadores.</p>
          </div>
          <Link href="/rules" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">Ver como jugador</Link>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{editingId ? "Editar sección" : "Nueva sección"}</h2>
              <p className="mt-1 text-sm text-zinc-500">Ejemplos: Generales, Batalla, Conducta, Estados.</p>
            </div>
            {editingId && <button type="button" onClick={resetForm} className="text-sm text-zinc-500 hover:text-white">Cancelar edición</button>}
          </div>

          <label className="mt-6 block">
            <span className="text-sm text-zinc-400">Título de la sección</span>
            <input
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej. Reglas generales"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500"
            />
          </label>

          <label className="mt-5 block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-zinc-400">Reglas</span>
              <span className="text-xs text-zinc-600">Sintaxis tipo WhatsApp: *negrita* · _cursiva_ · ~tachado~ · `código` · &gt; cita</span>
            </div>
            <textarea
              maxLength={30000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Escribe aquí todas las reglas de esta sección..."
              rows={16}
              className="mt-2 min-h-80 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-white outline-none focus:border-zinc-500"
            />
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">Previsualización</div>
              {content.trim() ? <WhatsAppMarkup text={content} /> : <p className="text-sm text-zinc-600">La previsualización aparecerá aquí mientras escribes.</p>}
            </div>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-5 rounded-lg bg-white px-5 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
          >
            {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear sección"}
          </button>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Secciones existentes</h2><span className="text-xs text-zinc-600">Usa ↑ y ↓ para cambiar el orden</span></div>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">Cargando...</p>
          ) : rules.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no hay secciones de reglas.
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {rules.map((rule, index) => (
                <article key={rule.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="mb-1 text-xs text-zinc-600">Posición {index + 1}</div><h3 className="text-lg font-semibold">{rule.title}</h3></div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => moveRule(index, -1)} disabled={index === 0} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-30">↑</button><button type="button" onClick={() => moveRule(index, 1)} disabled={index === rules.length - 1} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-30">↓</button><button type="button" onClick={() => editRule(rule)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Editar</button>
                      <button type="button" onClick={() => removeRule(rule.id)} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 hover:bg-red-950/40">Eliminar</button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-sm font-medium text-zinc-300">Banner</p><p className="mt-1 text-xs text-zinc-600">Aparece como encabezado.</p><label className="mt-3 inline-block cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">{uploading === "banner-" + rule.id ? "Subiendo..." : "Subir imagen"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading !== null} onChange={(e) => { void uploadImage(rule.id, "banner", e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>{rule.bannerUrl && <button type="button" onClick={() => void removeImage(rule.id, "banner")} className="ml-2 rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300">Quitar</button>}</div><div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-sm font-medium text-zinc-300">Fondo</p><p className="mt-1 text-xs text-zinc-600">Se muestra detrás del contenido.</p><label className="mt-3 inline-block cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">{uploading === "background-" + rule.id ? "Subiendo..." : "Subir imagen"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading !== null} onChange={(e) => { void uploadImage(rule.id, "background", e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>{rule.backgroundUrl && <button type="button" onClick={() => void removeImage(rule.id, "background")} className="ml-2 rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300">Quitar</button>}</div></div><div className="relative mt-4 overflow-hidden rounded-xl border border-zinc-800">{rule.backgroundUrl && <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{backgroundImage: `url("${rule.backgroundUrl}")`}} />}<div className="relative p-4"><WhatsAppMarkup text={rule.content} /></div></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
