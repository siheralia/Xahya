export type MazeCapabilities = {
  invisibility: boolean;
};

/** Returns capabilities granted by approved skills and equipped item effects. */
export async function getCharacterMazeCapabilities(tx: any, characterId: number): Promise<MazeCapabilities> {
  const CharacterItem = (tx.orm.public as any).CharacterItem;
  const Item = (tx.orm.public as any).Item;
  const Skill = (tx.orm.public as any).Skill;

  let invisibility = false;

  if (CharacterItem && Item) {
    const ownedItems = await CharacterItem.where({ characterId }).all();
    const itemDefinitions = await Item.all();
    for (const owned of ownedItems) {
      if (!Boolean(owned.equipped)) continue;
      const item = itemDefinitions.find((candidate: any) => Number(candidate.id) === Number(owned.itemId));
      const effects = Array.isArray(item?.effects) ? item.effects : [];
      if (effects.some((effect: any) => String(effect?.type ?? '').toUpperCase() === 'MAZE_UTILITY' && String(effect?.stat ?? '').toUpperCase() === 'INVISIBILITY')) {
        invisibility = true;
        break;
      }
    }
  }

  if (!invisibility && Skill) {
    const skills = await Skill.where({ characterId }).all();
    invisibility = skills
      .filter((skill: any) => String(skill.status) === 'APPROVED')
      .some((skill: any) => {
        const effects = Array.isArray(skill.effect) ? skill.effect : [];
        return effects.some((effect: any) => String(effect?.type ?? '').toUpperCase() === 'MAZE_UTILITY' && String(effect?.target ?? '').toUpperCase() === 'INVISIBILITY');
      });
  }

  return { invisibility };
}
