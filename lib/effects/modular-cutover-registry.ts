import {db} from "@/lib/db";
import {
  MODULAR_CUTOVER_KEY,readModularCutoverSetting,type ModularCutoverSetting
} from "./modular-cutover";

/** Read dynamically, so rollback does not depend on a new Vercel deployment. */
export async function readModularCutover():Promise<ModularCutoverSetting>{
 const row=await db.orm.public.AppSetting.where({key:MODULAR_CUTOVER_KEY}).first();
 return readModularCutoverSetting(row?.value);
}
