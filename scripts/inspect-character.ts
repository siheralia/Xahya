import { db } from "../lib/db";

async function main() {
  console.log("CharacterStat.update:");
  console.log(db.orm.public.CharacterStat.update.toString());

  await db.close();
}

main();