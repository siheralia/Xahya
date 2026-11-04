import {cloneLegacySkillAsMicro,evaluateLegacyShadowParts} from "./effects/legacy-modular-shadow";
import { racialMazeBonuses, type RacialMazeBonuses } from "./maze-racial-effects";
export type MazeCapabilities = { invisibility: boolean } & RacialMazeBonuses;

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

  const skills = Skill ? await Skill.where({ characterId }).all() : [];
  if (!invisibility) {
    invisibility = skills
      .filter((skill: any) => String(skill.status) === "APPROVED")
      .some((skill: any) => {
        const effects = Array.isArray(skill.effect) ? skill.effect : [];
        // Prefer the modular capability for complete conversions, but never
        // remove a working legacy effect with an unsupported combination.
        const clone=cloneLegacySkillAsMicro({
          id:Number(skill.id),name:String(skill.name??"Invisibilidad"),effect:effects
        },"skill");
        if(clone.coverage==="COMPLETE"&&clone.parts.every(part=>part.sourceType==="MAZE_UTILITY")){
          return evaluateLegacyShadowParts(clone.parts).some(intent=>
            intent.kind==="BONUS"&&intent.stat==="MAZE_INVISIBILITY"&&intent.amount>0);
        }
        return effects.some((effect: any) => String(effect?.type ?? "").toUpperCase() === "MAZE_UTILITY"
          && String(effect?.target ?? "").toUpperCase() === "INVISIBILITY");
      });
  }
  return { invisibility, ...racialMazeBonuses(skills) };
}
