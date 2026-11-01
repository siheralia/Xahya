"use client";
import { useEffect, useMemo, useState } from "react";
import type { EffectRequirement } from "@/lib/skills/effect-requirements";

type ManagedElementOption = { key: string; name: string };

export function EffectRequirementsField({
  value, onChange, effects,
}: {
  value: EffectRequirement[];
  onChange: (next: EffectRequirement[]) => void;
  effects: { type: string; label: string }[];
}) {
  const [elements, setElements] = useState<ManagedElementOption[]>([]);
  const [elementError, setElementError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/management/elements", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data?.elements)) throw new Error("Catálogo inválido.");
        const entries = data.elements.filter(
          (item: unknown): item is ManagedElementOption => !!item && typeof item === "object"
            && typeof (item as ManagedElementOption).key === "string"
            && typeof (item as ManagedElementOption).name === "string",
        );
        setElements(entries);
        setElementError(entries.length === 0);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.error("[skill-requirements] Failed to load elements", error);
          setElementError(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const options = useMemo(
    () => [...new Map([...effects, { type: "CREATE", label: "Crear" }].map(effect => [effect.type, effect])).values()],
    [effects],
  );

  return <fieldset className="space-y-3 rounded-xl border border-zinc-700 p-4">
    <legend className="px-2 text-sm font-semibold">Requisitos por efecto</legend>
    <p className="text-xs text-zinc-400">
      Añadir requisitos reduce el costo de creación: 10 % por efecto, 20 % por efecto y elemento,
      hasta un 50 %. Para activar la habilidad, el personaje deberá tener una habilidad aprobada
      que cumpla cada requisito.
    </p>
    {loading && <p className="text-xs text-zinc-400">Cargando elementos…</p>}
    {elementError && <p role="alert" className="text-xs text-amber-300">
      No se pudo cargar el catálogo de elementos; comprueba la conexión antes de cambiar el elemento.
    </p>}
    {value.map((requirement, index) => <div key={index} className="flex flex-wrap items-center gap-2">
      <select aria-label="Efecto requerido" value={requirement.effect}
        onChange={event => onChange(value.map((entry, i) => i === index ? { ...entry, effect: event.target.value } : entry))}
        className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 p-2">
        {!options.some(option => option.type === requirement.effect) &&
          <option value={requirement.effect}>{requirement.effect}</option>}
        {options.map(option => <option key={option.type} value={option.type}>{option.label}</option>)}
      </select>
      <select aria-label="Elemento requerido" value={requirement.element ?? ""}
        onChange={event => onChange(value.map((entry, i) => i === index
          ? { ...entry, element: event.target.value } : entry))}
        className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 p-2">
        <option value="">Cualquier elemento (sin elemento específico)</option>
        {requirement.element && !elements.some(element => element.key === requirement.element) &&
          <option value={requirement.element}>{requirement.element}</option>}
        {elements.map(element => <option key={element.key} value={element.key}>{element.name}</option>)}
      </select>
      <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}
        className="rounded border border-zinc-700 px-3 py-2">Quitar</button>
    </div>)}
    <button type="button" disabled={value.length >= 10} onClick={() => {
      const nextEffect = options.find(option => !value.some(requirement =>
        requirement.effect === option.type && !requirement.element,
      ))?.type ?? "CREATE";
      onChange([...value, { effect: nextEffect, element: "" }]);
    }} className="rounded border border-cyan-700 px-3 py-2 disabled:opacity-40">
      Añadir requisito
    </button>
  </fieldset>;
}
