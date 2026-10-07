import { getCreationRollProbability } from "@/lib/perks";

export async function getActiveRaces(tx: any) {
  const Race = tx?.orm?.public?.Race;
  const RacePerk = tx?.orm?.public?.RacePerk;
  const Perk = tx?.orm?.public?.Perk;
  if (!Race || !RacePerk || !Perk) return [];

  const races = await Race.where({ active: true }).all();
  const links = await RacePerk.all();
  const perks = await Perk.where({ active: true }).all();

  return races.map((race: any) => ({
    id: Number(race.id),
    name: String(race.name),
    description: race.description ?? null,
    imagePath: race.imagePath ?? null,
    perks: links
      .filter((link: any) => Number(link.raceId) === Number(race.id))
      .map((link: any) => perks.find((perk: any) => Number(perk.id) === Number(link.perkId)))
      .filter(Boolean)
      .map((perk: any) => ({
        id: Number(perk.id),
        name: String(perk.name),
        description: perk.description ?? null,
        stackable: Boolean(perk.stackable),
        maxStacks: perk.maxStacks == null ? null : Number(perk.maxStacks),
      })),
  }));
}

export function getResourceBonus(perk: any) {
  return (Array.isArray(perk?.effects) ? perk.effects : []).reduce(
    (totals: { karma: number; money: number; levelUpPoints: number }, effect: any) => {
      const value = Number(effect?.value ?? 0);
      if (String(effect?.type) === "RESOURCE_BONUS") {
        if (String(effect?.target) === "KARMA") totals.karma += value;
        if (String(effect?.target) === "MONEY") totals.money += value;
        if (String(effect?.target) === "LEVEL_UP_POINTS") totals.levelUpPoints += value;
      }
      return totals;
    },
    { karma: 0, money: 0, levelUpPoints: 0 },
  );
}

export async function syncCharacterRacePerks(tx: any, characterId: number, raceId: number) {
  const Character = tx.orm.public.Character;
  const CharacterPerk = tx.orm.public.CharacterPerk;
  const RacePerk = tx.orm.public.RacePerk;
  const Perk = tx.orm.public.Perk;
  const CharacterResource = tx.orm.public.CharacterResource;

  const character = await Character.where({ id: characterId }).first();
  if (!character) throw new Error("Personaje no encontrado.");

  const currentEntries = await CharacterPerk.where({ characterId }).all();
  const oldRaceId = character.raceId == null ? null : Number(character.raceId);

  const allPerks = await Perk.all();
  const byId = new Map(allPerks.map((perk: any) => [Number(perk.id), perk]));

  if (oldRaceId != null) {
    const oldLinks = await RacePerk.where({ raceId: oldRaceId }).all();
    const oldIds = new Set(oldLinks.map((link: any) => Number(link.perkId)));

    for (const entry of currentEntries) {
      if (String(entry.source) !== "RACE" || !oldIds.has(Number(entry.perkId))) continue;
      const perk = byId.get(Number(entry.perkId));
      if (perk && CharacterResource) {
        const bonus = getResourceBonus(perk);
        const resource = await CharacterResource.where({ characterId }).first();
        if (resource) {
          await CharacterResource.where({ characterId }).update({
            karma: Number(resource.karma ?? 0) - bonus.karma,
            money: Number(resource.money ?? 0) - bonus.money,
            levelUpPoints: Number(resource.levelUpPoints ?? 0) - bonus.levelUpPoints,
          });
        }
      }
      await CharacterPerk.where({ id: entry.id }).delete();
    }
  }

  const newLinks = await RacePerk.where({ raceId }).all();
  const remainingEntries = await CharacterPerk.where({ characterId }).all();
  const creationOrOther = remainingEntries.filter((entry: any) => String(entry.source) !== "RACE");

  for (const link of newLinks) {
    const perk = byId.get(Number(link.perkId));
    if (!perk || !Boolean(perk.active)) continue;

    const existingCount = creationOrOther.filter((entry: any) => Number(entry.perkId) === Number(perk.id)).length;
    const raceCount = remainingEntries.filter(
      (entry: any) => String(entry.source) === "RACE" && Number(entry.perkId) === Number(perk.id),
    ).length;

    const totalCount = existingCount + raceCount;
    const maxStacks = Number(perk.maxStacks ?? (perk.stackable ? Number.MAX_SAFE_INTEGER : 1));
    if (totalCount >= maxStacks) continue;

    const entry = await CharacterPerk.create({
      characterId,
      perkId: Number(perk.id),
      source: "RACE",
    });
    remainingEntries.push(entry);

    if (CharacterResource) {
      const bonus = getResourceBonus(perk);
      if (bonus.karma || bonus.money || bonus.levelUpPoints) {
        const resource = await CharacterResource.where({ characterId }).first();
        if (resource) {
          await CharacterResource.where({ characterId }).update({
            karma: Number(resource.karma ?? 0) + bonus.karma,
            money: Number(resource.money ?? 0) + bonus.money,
            levelUpPoints: Number(resource.levelUpPoints ?? 0) + bonus.levelUpPoints,
          });
        }
      }
    }
  }

  await Character.where({ id: characterId }).update({ raceId });
  return Character.where({ id: characterId }).first();
}
