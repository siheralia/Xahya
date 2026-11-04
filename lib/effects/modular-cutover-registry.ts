import {db} from "@/lib/db";
import {
  modularCutoverStorageKey,readModularCutoverSetting,type ModularCutoverSetting
} from "./modular-cutover";

/** Read dynamically, so rollback does not depend on a new Vercel deployment. */
export async function readModularCutover():Promise<ModularCutoverSetting>{
 const row=await db.orm.public.AppSetting.where({key:modularCutoverStorageKey()}).first();
 return readModularCutoverSetting(row?.value);
}
