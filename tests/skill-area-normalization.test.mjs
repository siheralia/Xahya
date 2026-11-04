import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 SKILL_AREA_OPTIONS,parseSkillArea,formatSkillArea,normalizeSkillArea,
 editorSkillArea,validateSkillAreaRadius,
} from "../lib/skills/area-of-effect.ts";
import {serializeSkillRange} from "../lib/skills/range-storage.ts";
import {parseConfiguredSkillRange} from "../lib/combat/skill-range.ts";
import {compileCombatAttackArea} from "../lib/combat/skill-area.ts";

test("typed area choices are finite, localized and have dedicated radius",()=>{
 assert.deepEqual(SKILL_AREA_OPTIONS.map(v=>v.value),
  ["SINGLE","SELF","CONTACT","CIRCLE","SELF_FIELD","UNSPECIFIED"]);
 for(const kind of ["SINGLE","SELF","CONTACT","SELF_FIELD","UNSPECIFIED"]){
  const label=formatSkillArea(kind);
  assert.equal(parseSkillArea(label).kind,kind);
  assert.equal(parseSkillArea(label).radiusMeters,null);
 }
 assert.equal(formatSkillArea("CIRCLE",2.5),"Área circular de 2.5 m");
 assert.equal(parseSkillArea("Área circular de 2,5 m").radiusMeters,2.5);
 assert.equal(parseSkillArea("Radio: 3 m").kind,"CIRCLE");
 assert.equal(compileCombatAttackArea("Área circular de 2,5 m").radiusNormalized,.25);
 assert.equal(editorSkillArea("Radio 4 m").radiusMeters,4);
 for(const n of [0,-1,10.001,11,Infinity,NaN,"hola"]){
  assert.throws(()=>validateSkillAreaRadius(n),/radio/);
 }
 assert.throws(()=>formatSkillArea("LEGACY"),/descripción antigua/);
});

test("canonical spelling and suffix; range and radius are unrelated values",()=>{
 assert.equal(normalizeSkillArea("Objetivo unico"),"Objetivo único");
 assert.equal(normalizeSkillArea("Oponente único"),"Objetivo único");
 assert.equal(normalizeSkillArea("Usuario"),"Personal");
 assert.equal(normalizeSkillArea("Oponente al contacto"),"Contacto");
 assert.equal(serializeSkillRange("Objetivo unico | Alcance máximo: 7 m",5),
  "Objetivo único | Alcance máximo: 5 m");
 const stored=serializeSkillRange("Área circular de 3 m",6);
 assert.equal(stored,"Área circular de 3 m | Alcance máximo: 6 m");
 assert.deepEqual(parseConfiguredSkillRange(stored),
  {area:"Área circular de 3 m",rangeMeters:6});
 assert.equal(compileCombatAttackArea(parseConfiguredSkillRange(stored).area).radiusMeters,3);
 assert.throws(()=>serializeSkillRange("Objetivo único",101),/Distancia/);
 assert.throws(()=>serializeSkillRange("Objetivo único",-1),/Distancia/);
});

test("legacy-special and invalid dimensions remain literal, never invented circles",()=>{
 const oldValues=[
 "100m","1m","Arena creada o controlada por Sikatā",
 "Usuario (bloqueo al contacto)","Objeto al contacto",
 "Objetivo único (usuario o aliado), hasta 5 m",
 ];
 for(const old of oldValues){
  const parsed=parseSkillArea(old);
  assert.equal(parsed.kind,"LEGACY");
  assert.equal(parsed.legacyValue,old);
  assert.equal(normalizeSkillArea(old),old);
  assert.equal(editorSkillArea(old).kind,"LEGACY");
  assert.equal(compileCombatAttackArea(old),null);
 }
 assert.equal(parseSkillArea(null).kind,"UNSPECIFIED");
 assert.equal(parseSkillArea("No especificada").kind,"UNSPECIFIED");
 assert.equal(parseSkillArea("Radio 100 m").kind,"LEGACY");
 assert.throws(()=>compileCombatAttackArea("Radio 100 m"),/radio/);
 assert.throws(()=>compileCombatAttackArea("Cono de 5 m"),/Área/);
});

test("existing range metadata remains separate even for historical mirror and Sikatā skills",()=>{
 const mirror=parseConfiguredSkillRange("100m | Alcance máximo: 5 m");
 assert.deepEqual(mirror,{area:"100m",rangeMeters:5});
 const sikata=parseConfiguredSkillRange("Campo alrededor del usuario | Alcance máximo: 5 m");
 assert.deepEqual(sikata,{area:"Campo alrededor del usuario",rangeMeters:5});
 assert.equal(serializeSkillRange(mirror.area,mirror.rangeMeters),
  "100m | Alcance máximo: 5 m");
 assert.equal(serializeSkillRange("Arena creada o controlada por Sikatā",7),
  "Arena creada o controlada por Sikatā | Alcance máximo: 7 m");
});

test("all skill creation paths use canonical serializer and the UI uses finite selector",()=>{
 const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const form=load("components/skills/SkillCoreFields.tsx");
 assert.match(form,/SKILL_AREA_OPTIONS\.map/);
 assert.match(form,/Radio del círculo/);
 assert.match(form,/pendiente de clasificar/);
 assert.doesNotMatch(form,/<input value=\{form\.areaOfEffect\} onChange=/);
 for(const path of [
  "app/api/characters/[id]/skills/route.ts",
  "app/api/management/skills/route.ts",
  "app/api/management/skills/[id]/route.ts",
  "app/api/management/skills/upgrades/[id]/route.ts",
  "app/api/characters/[id]/generic-skills/route.ts",
 ])assert.match(load(path),/serializeSkillRange/);
 for(const path of ["app/characters/[id]/page.tsx","app/management/skills/page.tsx"]){
  const page=load(path);
  assert.ok(page.indexOf('"use client"')<page.indexOf("import {normalizeSkillArea}"));
 }
});
