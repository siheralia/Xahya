"use client";

export type AvailableSkill = { id: number; name: string; status: string; characterId: number };
export function SkillPrerequisitesField({
  characterId, skillId, availableSkills, requiredSkillIds, onChange,
}: {
  characterId: number;
  skillId?: number | null;
  availableSkills: AvailableSkill[];
  requiredSkillIds: number[];
  onChange: (next: number[]) => void;
}) {
  const options = availableSkills.filter(skill =>
    skill.characterId === characterId && skill.status === "APPROVED" && skill.id !== skillId
  );
  return <fieldset className="rounded-xl border border-zinc-700 p-4">
    <legend className="px-2 text-sm font-semibold">Habilidades requeridas</legend>
    <p className="mb-3 text-xs text-zinc-400">
      Selecciona habilidades aprobadas que el personaje debe conocer para utilizar esta técnica.
      Puede ser magia aprendida o una capacidad racial equivalente.
    </p>
    {options.length === 0 ? <p className="text-sm text-zinc-500">No hay habilidades aprobadas disponibles.</p> :
      <div className="grid gap-2 sm:grid-cols-2">{options.map(skill =>
        <label key={skill.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requiredSkillIds.includes(skill.id)}
            onChange={event => onChange(event.target.checked
              ? [...requiredSkillIds, skill.id]
              : requiredSkillIds.filter(id => id !== skill.id))} />
          <span>{skill.name}</span>
        </label>
      )}</div>}
  </fieldset>;
}
