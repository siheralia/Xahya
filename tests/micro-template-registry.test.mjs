import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  validateTemplateInput,readMicroTemplate,transitionMicroTemplate,isTemplateId
} from "../lib/effects/micro-template-core.ts";

const ID="f9c15de5-780c-4621-b4bb-21299899ef11";
const timestamp="2026-11-04T12:00:00.000Z";
const effect=()=>({
  id:"GRACE",name:"Gracia divina",type:"COMPOSED",description:"Almacena mitigación",
  trigger:"DAMAGE_RESOLVED",steps:[{
    kind:"STORE",accumulator:"DIVINE_GRACE",capacity:5,
    value:{source:"EVENT",key:"MITIGATED_DAMAGE"}
  }]
});
const template=()=>({
  id:ID,revision:1,status:"DRAFT",effect:effect(),proposedPch:null,reviewedPch:null,
  pricingNotes:"",sourceTemplateId:null,createdBy:10,reviewedBy:null,
  createdAt:timestamp,updatedAt:timestamp,enabledForSkills:false,
});
test("the template validator requires an actual valid modular effect and sensible provisional PCH",()=>{
  assert.equal(validateTemplateInput({effect:effect(),proposedPch:null,pricingNotes:""}),null);
  assert.equal(validateTemplateInput({effect:effect(),proposedPch:12,pricingNotes:"Coste bajo revisión"}),null);
  assert.match(validateTemplateInput({effect:effect(),proposedPch:-1,pricingNotes:""}),/PCH/);
  assert.match(validateTemplateInput({effect:effect(),proposedPch:1.5,pricingNotes:""}),/PCH/);
  assert.match(validateTemplateInput({effect:effect(),proposedPch:0,pricingNotes:42}),/Justificación/);
  assert.match(validateTemplateInput({effect:{...effect(),steps:[]},proposedPch:5,pricingNotes:""}),/contenedor/);
});
test("read roundtrips draft and forcibly keeps runtime disabled",()=>{
  assert.equal(isTemplateId(ID),true);
  assert.equal(isTemplateId("../whatever"),false);
  const parsed=readMicroTemplate(JSON.stringify({...template(),enabledForSkills:true}));
  assert.equal(parsed?.enabledForSkills,false);
  assert.deepEqual(parsed?.effect,effect());
  assert.equal(readMicroTemplate("not-json"),null);
  assert.equal(readMicroTemplate(JSON.stringify({...template(),revision:0})),null);
  assert.equal(readMicroTemplate(JSON.stringify({...template(),status:"APPROVED"})),null);
});
test("editing a draft stores full declarative config, increments revision, and allows review",()=>{
  const changes={effect:{...effect(),name:"Gracia divina II"},proposedPch:22,pricingNotes:"Pendiente de fórmula"};
  const saved=transitionMicroTemplate(template(),"SAVE",changes,10,timestamp);
  assert.equal(saved.revision,2);
  assert.equal(saved.status,"DRAFT");
  assert.equal(saved.effect.name,"Gracia divina II");
  assert.equal(saved.proposedPch,22);
  const submitted=transitionMicroTemplate(saved,"SUBMIT",changes,10,timestamp);
  assert.equal(submitted.status,"PENDING");
  assert.equal(submitted.revision,3);
  assert.throws(()=>transitionMicroTemplate(submitted,"SAVE",changes,10,timestamp),/revisión/);
});
test("approval requires a human-assigned positive provisional PCH and locks the template",()=>{
  const pending={...template(),status:"PENDING"};
  assert.throws(()=>transitionMicroTemplate(pending,"APPROVE",{reviewedPch:0},11,timestamp),/PCH/);
  assert.throws(()=>transitionMicroTemplate(pending,"APPROVE",{reviewedPch:1.2},11,timestamp),/PCH/);
  const approved=transitionMicroTemplate(pending,"APPROVE",{reviewedPch:18},11,timestamp);
  assert.equal(approved.status,"APPROVED");
  assert.equal(approved.reviewedPch,18);
  assert.equal(approved.reviewedBy,11);
  assert.equal(approved.enabledForSkills,false);
  assert.equal(readMicroTemplate(JSON.stringify(approved))?.status,"APPROVED");
  assert.throws(()=>transitionMicroTemplate(approved,"SAVE",{effect:effect(),pricingNotes:""},11,timestamp),/inmutable/);
  assert.throws(()=>transitionMicroTemplate(approved,"REJECT",{},11,timestamp),/inmutable/);
});
test("rejected templates can be reworked without granting PCH or activation",()=>{
  const pending={...template(),status:"PENDING"};
  const rejected=transitionMicroTemplate(pending,"REJECT",{},11,timestamp);
  assert.equal(rejected.status,"REJECTED");
  assert.equal(rejected.reviewedPch,null);
  assert.equal(rejected.enabledForSkills,false);
  const changed=transitionMicroTemplate(rejected,"SAVE",{
    effect:{...effect(),type:"PASSIVE"},proposedPch:15,pricingNotes:"Propuesta"
  },10,timestamp);
  assert.equal(changed.status,"DRAFT");
  assert.equal(changed.reviewedBy,null);
  assert.equal(changed.effect.type,"PASSIVE");
});
test("catalog approval cannot be invoked through the combat actions API",()=>{
  const api=readFileSync(new URL("../app/api/management/effect-modules/route.ts",import.meta.url),"utf8");
  const combat=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
  assert.match(api,/hasRolePermission/);
  assert.match(api,/expectedRevision/);
  assert.match(api,/REVISION_CONFLICT/);
  assert.match(api,/MICRO_TEMPLATE_/);
  assert.doesNotMatch(combat,/installEncounterMicroEffects/);
});
