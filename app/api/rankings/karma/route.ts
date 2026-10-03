import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const PUBLIC_KARMA_HIDE_SUBTYPE = "KARMA_VEIL";

export async function GET() {
  const User = db.orm.public.User;
  const Character = db.orm.public.Character;
  const CharacterResource = db.orm.public.CharacterResource;
  const CharacterItem = (db.orm.public as any).CharacterItem;
  const Item = (db.orm.public as any).Item;

  const [users, characters, resources, ownedItems, items] = await Promise.all([
    User.all(),
    Character.all(),
    CharacterResource.all(),
    CharacterItem ? CharacterItem.all() : Promise.resolve([]),
    Item ? Item.all() : Promise.resolve([]),
  ]);

  const hiddenItemIds = new Set(
    (items as any[])
      .filter((item) => String(item?.itemSubtype ?? "") === PUBLIC_KARMA_HIDE_SUBTYPE)
      .map((item) => Number(item.id)),
  );

  const hiddenCharacterIds = new Set(
    (ownedItems as any[])
      .filter((entry) => Number(entry?.quantity ?? 0) > 0 && hiddenItemIds.has(Number(entry?.itemId)))
      .map((entry) => Number(entry.characterId)),
  );

  const systemUserIds = new Set(
    (users as any[])
      .filter((user) => String(user.role) === "SYSTEM")
      .map((user) => Number(user.id)),
  );

  const resourceByCharacter = new Map(
    (resources as any[]).map((resource) => [Number(resource.characterId), resource]),
  );

  const ranking = (characters as any[])
    .filter((character) =>
      !systemUserIds.has(Number(character.userId)) &&
      !hiddenCharacterIds.has(Number(character.id))
    )
    .map((character) => {
      const resource = resourceByCharacter.get(Number(character.id));
      return {
        id: Number(character.id),
        name: String(character.name),
        flair: character.flair == null ? null : String(character.flair),
        karma: Number(resource?.karma ?? 0),
      };
    })
    .sort((a, b) => b.karma - a.karma || a.id - b.id)
    .slice(0, 3);

  return NextResponse.json({ ranking });
}
