import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {cloneLegacySkillAsMicro} from "../lib/effects/legacy-modular-shadow.ts";
import {
 readModularCutoverSetting,decideModularExecution,DEFAULT_MODULAR_CUTOVER
} from "../lib/effects/modular-cutover.ts";

const fixtures=JSON.parse(readFileSync(new URL("./fixtures/legacy-modular-shadow-2026-11-04.json",import.meta.url),"utf8"));
const code=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("bulk modular migration evaluates all 63 historical definitions, leaving originals byte-for-byte unchanged",()=>{
 const snapshot=JSON.stringify(fixtures.definitions);
 const statuses={COMPLETE:0,PARTIAL:0,UNSUPPORTED:0};
 for(const row of fixtures.definitions){
  const shadow=cloneLegacySkillAsMicro({...row,name:"Skills-"+row.id},row.source);
  assert.equal(shadow.enabled,false);
  assert.equal(shadow.uncharged,true);
  assert.equal(shadow.origin.id,row.id);
  assert.equal(shadow.parts.length,row.effect.length);
  assert.equal(shadow.represented,true,"Every audited effect must have a safe representation.");
  statuses[shadow.coverage]++;
 }
 assert.equal(fixtures.definitions.length,63);
 assert.deepEqual(JSON.stringify(fixtures.definitions),snapshot);
 assert.equal(Object.values(statuses).reduce((a,b)=>a+b,0),63);
});
test("the bulk runtime switch is reversible and doesn't claim unsupported abilities are executable",()=>{
 assert.deepEqual(readModularCutoverSetting(null),DEFAULT_MODULAR_CUTOVER);
 assert.equal(decideModularExecution("MODULAR_FIRST",true),"MODULAR");
 assert.equal(decideModularExecution("MODULAR_FIRST",false),"LEGACY_FALLBACK");
 assert.equal(decideModularExecution("LEGACY_ONLY",true),"LEGACY_ROLLBACK");
 assert.equal(decideModularExecution("LEGACY_ONLY",false),"LEGACY_ROLLBACK");
 assert.equal(readModularCutoverSetting(JSON.stringify({
  version:1,mode:"LEGACY_ONLY",revision:1,changedBy:1,changedAt:"2026-11-04"
 })).mode,"LEGACY_ONLY");
 assert.equal(readModularCutoverSetting('{"version":1,"mode":"INVENTED","revision":1}').mode,"MODULAR_FIRST");
});
test("complete combat skill uses the module and rollback produces the exact same combat plan values",()=>{
 const skill={id:4237,status:"APPROVED",name:"Alfa",category:"OFFENSIVE",
  cost:20,attackType:"CUT",areaOfEffect:"Alcance máximo: 5 m",
  cooldown:"1 turno",duration:"Instantánea",
  effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYS_ATK",value:100},
    {type:"IGNORE_PHYS_DEF_MULTIPLIER",target:"PHYS_DEF",value:50},
    {type:"FINAL_DAMAGE_MULTIPLIER",target:"PHYS_ATK",value:300}]
 };
 const modular=compileCombatSkill(skill,"MODULAR_FIRST");
 const original=compileCombatSkill(skill,"LEGACY_ONLY");
 assert.equal(modular.executionEngine,"MODULAR");
 assert.equal(original.executionEngine,"LEGACY_ROLLBACK");
 const values=plan=>({
  category:plan.category,range:plan.rangeMeters,cost:plan.cost,
  damageMultiplier:plan.damageMultiplier,defenseFactor:plan.defenseFactor,
  finalMultiplier:plan.finalMultiplier,healing:plan.healing,bonuses:plan.bonuses,
  attackType:plan.attackType,durationTurns:plan.durationTurns,
  cooldownRounds:plan.cooldownRounds
 });
 assert.deepEqual(values(modular),values(original));
});
test("unknown narrative effects remain blocked; toggling cannot bypass approvals or invent damage",()=>{
 const row={id:8991,status:"APPROVED",category:"OFFENSIVE",cost:0,
  effect:[{type:"NARRATIVE",target:"CARD:W032",value:1}]};
 assert.throws(()=>compileCombatSkill(row,"MODULAR_FIRST"),/no crea una construcción ejecutable/);
 assert.throws(()=>compileCombatSkill(row,"LEGACY_ONLY"),/no crea una construcción ejecutable/);
 assert.throws(()=>compileCombatSkill({...row,status:"PENDING"},"MODULAR_FIRST"),/Solo puedes utilizar habilidades aprobadas/);
});
test("UI has real XYFlow graph wiring and an admin rollback switch, not Mermaid art",()=>{
 const flow=code("components/effects/MicroEffectFlowEditor.tsx");
 const builder=code("components/effects/MicroEffectBuilder.tsx");
 const gallery=code("app/management/effects/legacy-shadows/page.tsx");
 const api=code("app/api/management/effects/modular-cutover/route.ts");
 const action=code("app/api/combat/[id]/actions/route.ts");
 const manifest=JSON.parse(code("package.json"));
 assert.equal(manifest.dependencies["@xyflow/react"],"12.12.1");
 for(const fragment of ["ReactFlow","Handle","onConnect","onEdgesDelete","targetHandle","readOnly"]){
  assert.ok(flow.includes(fragment),fragment);
 }
 assert.match(builder,/<MicroEffectFlowEditor/);
 assert.match(gallery,/Priorizar módulos con respaldo/);
 assert.match(gallery,/Volver al cálculo original/);
 assert.match(gallery,/readOnly onChange/);
 assert.match(api,/hasRolePermission\(user,"management\.effects",action\)/);
 assert.match(action,/readModularCutover\(\)/);
 assert.match(action,/compileCombatSkill\(skill,mode\)/);
 assert.doesNotMatch(api,/Skill\.create|Skill\.update|pchBalance/);
});
