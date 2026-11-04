import {db} from "@/lib/db";
import {MICRO_TEMPLATE_PREFIX,readMicroTemplate,type MicroEffectTemplate} from "./micro-template-core";
export {
  MICRO_TEMPLATE_PREFIX,isTemplateId,readMicroTemplate,
  transitionMicroTemplate,validateTemplateInput,
} from "./micro-template-core";
export type {MicroEffectTemplate,MicroTemplateStatus} from "./micro-template-core";

export async function listMicroTemplates():Promise<MicroEffectTemplate[]> {
  const rows=await db.orm.public.AppSetting.all();
  return rows.filter(row=>String(row.key).startsWith(MICRO_TEMPLATE_PREFIX))
    .map(row=>readMicroTemplate(row.value)).filter((t):t is MicroEffectTemplate=>t!==null)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
