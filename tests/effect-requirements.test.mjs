import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  effectRequirementDiscount, effectRequirementDiscountPercent,
  meetsEffectRequirements, validEffectRequirements,
} from "../lib/skills/effect-requirements.ts";

test("declarar Crear + Luz descuenta 20 % aunque aún no se conozca la habilidad", () => {
  const requirements = [{ effect: "CREATE", element: "LIGHT" }];
  assert.equal(effectRequirementDiscountPercent(requirements), 20);
  assert.equal(effectRequirementDiscount(15, requirements), 12);
});

test("solo efecto descuenta 10 %, elemento explícito descuenta 20 %", () => {
  assert.equal(effectRequirementDiscount(100, [{ effect: "CREATE" }]), 90);
  assert.equal(effectRequirementDiscount(100, [{ effect: "CREATE", element: "" }]), 90);
  assert.equal(effectRequirementDiscount(100, [{ effect: "CREATE", element: "NEUTRAL" }]), 80);
});

test("descuento acumulado limitado a 50 %, coste mínimo 1", () => {
  const requirements = ["CREATE", "STAT_BONUS", "RESOURCE_BONUS"].map(effect => ({ effect, element: "LIGHT" }));
  assert.equal(effectRequirementDiscountPercent(requirements), 50);
  assert.equal(effectRequirementDiscount(100, requirements), 50);
  assert.equal(effectRequirementDiscount(1, [{effect:"CREATE",element:"LIGHT"}]), 1);
  assert.equal(effectRequirementDiscount(0, requirements), 0);
});

test("rechaza requisitos duplicados antes de calcular descuentos", () => {
  const duplicate = [{effect:"CREATE",element:"LIGHT"},{effect:"CREATE",element:"LIGHT"}];
  assert.equal(validEffectRequirements(duplicate), false);
  assert.throws(() => effectRequirementDiscount(15, duplicate), /inválidos/);
});

test("se mantiene la comprobación de capacidades aprobadas al activar", () => {
  const requirements = [{ effect: "CREATE", element: "LIGHT" }];
  assert.equal(meetsEffectRequirements(requirements, []), false);
  const skill = {status:"APPROVED",effect:[{type:"NARRATIVE",capability:"CREATE",element:"LIGHT"}]};
  assert.equal(meetsEffectRequirements(requirements, [skill]), true);
  assert.equal(meetsEffectRequirements(requirements, [{...skill,status:"PENDING"}]), false);
  assert.equal(meetsEffectRequirements(requirements, [{...skill,effect:[{type:"NARRATIVE",capability:"CREATE",element:"FIRE"}]}]), false);
});

test("contrato ORM y selector de elementos consultan las fuentes oficiales", () => {
  const contract = readFileSync(new URL("../prisma/contract.prisma",import.meta.url),"utf8");
  const skill = contract.match(/model Skill \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(skill,/effectRequirements\s+Json/);
  assert.match(skill,/grantedByRaceSkillId\s+Int\?/);
  const selector = readFileSync(new URL("../components/skills/EffectRequirementsField.tsx",import.meta.url),"utf8");
  assert.match(selector,/api\/management\/elements/);
  assert.doesNotMatch(selector,/const elements = \["","NEUTRAL","FIRE"/);
});
