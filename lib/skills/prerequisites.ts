/**
 * Skill prerequisites are character-specific, not racial locks.
 * A different light-creation spell can satisfy a laser construct prerequisite.
 *
 * This module is deliberately independent of the database adapter so it can be
 * shared by the player and management skill APIs.
 */
export type SkillPrerequisite = {
  skillId: number;
  /** Optional capability that the referenced skill must supply. */
  capability?: string;
};

export type PrerequisiteSkill = {
  id: number;
  characterId: number;
  status: string;
  name?: string;
  capabilities?: string[] | null;
};

export const LIGHT_CONSTRUCTION = "LIGHT_CONSTRUCTION";

export function validateSkillPrerequisites(
  ownerCharacterId: number,
  ownSkillId: number | null,
  requirements: readonly SkillPrerequisite[],
  available: readonly PrerequisiteSkill[],
): string | null {
  if (requirements.length > 10) return "Máximo 10 habilidades requeridas.";
  const seen = new Set<number>();
  for (const requirement of requirements) {
    if (!Number.isSafeInteger(requirement.skillId) || requirement.skillId <= 0)
      return "Identificador de habilidad requerida inválido.";
    if (requirement.skillId === ownSkillId) return "Una habilidad no puede requerirse a sí misma.";
    if (seen.has(requirement.skillId)) return "Hay habilidades requeridas duplicadas.";
    seen.add(requirement.skillId);
    const skill = available.find(candidate => candidate.id === requirement.skillId);
    if (!skill || skill.characterId !== ownerCharacterId || skill.status !== "APPROVED")
      return "Solo se pueden requerir habilidades aprobadas del personaje.";
    if (requirement.capability && !skill.capabilities?.includes(requirement.capability))
      return "La habilidad requerida no proporciona la capacidad indicada.";
  }
  return null;
}

export function hasSkillPrerequisites(
  requirements: readonly SkillPrerequisite[],
  approvedSkillIds: ReadonlySet<number>,
): boolean {
  return requirements.every(requirement => approvedSkillIds.has(requirement.skillId));
}

/** Cycle detection across the entire prerequisite graph. */
export function hasPrerequisiteCycle(
  graph: ReadonlyMap<number, readonly SkillPrerequisite[]>,
): boolean {
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (id: number): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const requirement of graph.get(id) ?? []) {
      if (visit(requirement.skillId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...graph.keys()].some(visit);
}
