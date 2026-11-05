import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  MICRO_STEP_LABELS,MICRO_TRIGGER_LABELS,MICRO_SOURCE_LABELS,
  MICRO_OPERATOR_LABELS,MICRO_COMPARISON_LABELS,
  friendlyMicroKey,
} from "../lib/effects/micro-labels.ts";

test("editor labels describe common modular operations in Spanish",()=>{
  assert.equal(MICRO_STEP_LABELS.READ_STAT,"Leer estadística");
  assert.equal(MICRO_STEP_LABELS.DAMAGE,"Causar daño");
  assert.equal(MICRO_TRIGGER_LABELS.PASSIVE,"Pasiva (siempre disponible)");
  assert.equal(MICRO_SOURCE_LABELS.OUTPUT,"Resultado de otro módulo");
  assert.equal(MICRO_OPERATOR_LABELS.MULTIPLY,"Multiplicar");
  assert.equal(MICRO_COMPARISON_LABELS.GTE,"Mayor o igual que");
});

test("technical values remain stable while visible labels are localized",()=>{
  const payload={kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"resistanceBase"};
  assert.equal(friendlyMicroKey(payload.stat),"Defensa mágica");
  assert.equal(friendlyMicroKey(payload.output),"Defensa base");
  assert.equal(friendlyMicroKey("ATTACK_SPEED"),"Velocidad del ataque");
  assert.equal(friendlyMicroKey("new_statistic"),"New statistic");
  assert.deepEqual(payload,{kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"resistanceBase"});
});

test("tutorial is integrated into all shared skill forms without changing the stored schema",()=>{
  const modal=readFileSync(new URL("../components/skills/SkillFormModal.tsx",import.meta.url),"utf8");
  const guide=readFileSync(new URL("../components/skills/SkillCreationGuide.tsx",import.meta.url),"utf8");
  const builder=readFileSync(new URL("../components/effects/MicroEffectBuilder.tsx",import.meta.url),"utf8");
  assert.match(modal,/<SkillCreationGuide form=\{form\}/);
  assert.match(modal,/Configuración avanzada: mecánicas y requisitos/);
  assert.match(guide,/No hace falta conocer inglés ni fórmulas/);
  assert.match(guide,/Paso \{step\+1\} de \{STEPS.length\}/);
  assert.match(builder,/MICRO_STEP_LABELS\[kind\]/);
  assert.match(builder,/Opciones técnicas \(avanzado\)/);
});
