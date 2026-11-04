import {validateEffectContainers, type EffectContainer} from "./micro-modules.ts";

export const MICRO_TEMPLATE_PREFIX = "skills.micro-effect-template.v1:";
export type MicroTemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type MicroEffectTemplate = {
  id:string; revision:number; status:MicroTemplateStatus;
  effect:EffectContainer;
  proposedPch:number|null;
  reviewedPch:number|null;
  pricingNotes:string;
  sourceTemplateId:string|null;
  createdBy:number; reviewedBy:number|null;
  createdAt:string; updatedAt:string;
  /** Approval is editorial only until skill attribution/PCH and runtime gates exist. */
  enabledForSkills:false;
};

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isTemplateId=(v:unknown):v is string=>typeof v==="string"&&uuidPattern.test(v);
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v);
export function validateTemplateInput(input:unknown):string|null {
  if(!input||typeof input!=="object"||Array.isArray(input))return "Plantilla inválida.";
  const r=input as Record<string,unknown>;
  const err=validateEffectContainers([r.effect as EffectContainer]);
  if(err)return err;
  if(r.proposedPch!==null&&r.proposedPch!==undefined&&(!integer(r.proposedPch)||Number(r.proposedPch)<0||Number(r.proposedPch)>100000))
    return "Propuesta PCH inválida.";
  if(typeof r.pricingNotes!=="string"||r.pricingNotes.length>1500)return "Justificación PCH inválida.";
  return null;
}
export function readMicroTemplate(value:unknown):MicroEffectTemplate|null {
  try {
    const raw:unknown=typeof value==="string"?JSON.parse(value):value;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
    const t=raw as MicroEffectTemplate;
    if(!isTemplateId(t.id)||!integer(t.revision)||t.revision<1||
      !["DRAFT","PENDING","APPROVED","REJECTED"].includes(t.status)||
      !integer(t.createdBy)||t.createdBy<1||
      !Number.isFinite(Date.parse(t.createdAt))||
      !Number.isFinite(Date.parse(t.updatedAt))||
      validateTemplateInput({effect:t.effect,proposedPch:t.proposedPch,pricingNotes:t.pricingNotes})||
      (t.reviewedPch!==null&&(!integer(t.reviewedPch)||t.reviewedPch<1||t.reviewedPch>100000))||
      (t.status==="APPROVED"&&t.reviewedPch===null))return null;
    return {...t,enabledForSkills:false};
  }catch{return null;}
}
export function transitionMicroTemplate(
  current:MicroEffectTemplate,
  action:"SAVE"|"SUBMIT"|"APPROVE"|"REJECT",
  patch:Record<string,unknown>, reviewerId:number, now:string,
):MicroEffectTemplate {
  if(current.status==="APPROVED")throw new Error("Una plantilla aprobada es inmutable. Duplícala para crear otra versión.");
  const modified:MicroEffectTemplate={
    ...current,revision:current.revision+1,updatedAt:now,
  };
  if(action==="SAVE"||action==="SUBMIT"){
    if(current.status==="PENDING")throw new Error("Una plantilla en revisión no puede modificarse.");
    const effect=patch.effect as EffectContainer;
    const proposedPch=patch.proposedPch??null;
    const pricingNotes=patch.pricingNotes??"";
    const error=validateTemplateInput({effect,proposedPch,pricingNotes});
    if(error)throw new Error(error);
    modified.effect=effect;
    modified.proposedPch=proposedPch as number|null;
    modified.pricingNotes=pricingNotes as string;
    modified.reviewedPch=null;
    modified.reviewedBy=null;
    modified.status=action==="SUBMIT"?"PENDING":"DRAFT";
  }else if(action==="APPROVE"){
    if(current.status!=="PENDING")throw new Error("Solo puedes aprobar una plantilla pendiente.");
    const cost=patch.reviewedPch;
    if(!integer(cost)||cost<1||cost>100000)throw new Error("El revisor debe asignar un PCH provisional positivo.");
    modified.status="APPROVED";modified.reviewedPch=cost;modified.reviewedBy=reviewerId;
  }else{
    if(current.status!=="PENDING")throw new Error("Solo puedes rechazar una plantilla pendiente.");
    modified.status="REJECTED";modified.reviewedPch=null;modified.reviewedBy=reviewerId;
  }
  return {...modified,enabledForSkills:false};
}
