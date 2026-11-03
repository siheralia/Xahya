import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
const hud=readFileSync(new URL("../app/combat/[id]/CombatCharacterHud.tsx",import.meta.url),"utf8");
const modal=readFileSync(new URL("../app/combat/[id]/CombatDialog.tsx",import.meta.url),"utf8");
const loadout=readFileSync(new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");

test("compact maze-style HUD has collapsed HP/mana/PA and expanded combatant info",()=>{
 for(const value of ['aria-label="Panel del combatiente"','onOpenChange(!open)',
  'aria-expanded={open}',"Distancia al oponente","Alcance seleccionado",
  "Mini boost de karma","const hp=","const mp=","const pa="]){
  assert.ok(hud.includes(value),value);
 }
 assert.match(page,/<CombatCharacterHud fighter=\{state\.actors\[side\]\}/);
 assert.match(page,/Fighter name=\{state\.actors\[opposingSide\]\.name\}/);
});
test("source selector has three mutually exclusive choices and keeps skill categories",()=>{
 for(const label of ["Ataque mágico","Mano principal","Mano secundaria"]){
  assert.ok(hud.includes(label),label);
 }
 assert.match(hud,/aria-pressed=\{attackMode==="MAGIC_AREA"\}/);
 assert.match(hud,/aria-pressed=\{attackMode!=="MAGIC_AREA"/);
 assert.match(hud,/onChooseAttack\("MAGIC_AREA"\)/);
 assert.match(hud,/onChooseAttack\("MAIN_HAND"\)/);
 assert.match(hud,/onChooseAttack\("OFF_HAND"\)/);
 for(const group of ["OFFENSIVE","SUPPORT","UTILITY","BASIC","PASSIVE"]){
  assert.ok(hud.includes(group),group);
 }
 for(const name of ['"stats"','"inventory"','"skills"']){
  assert.ok(hud.includes(name),name);
 }
});
test("construction plus button is conditional on an approved usable CREATE roster",()=>{
 assert.match(hud,/canCreate&&<button/);
 assert.match(page,/canCreate=\{canCreateObjects\}/);
 assert.match(page,/const canCreateObjects=hasAccess&&creationMaterials\.length>0/);
 assert.match(loadout,/onConstructionMaterialsChange\(side,authorized/);
 assert.match(loadout,/onConstructionSkillsChange\?\.\(side,authorized/);
 assert.match(page,/constructionSkills\[side\]\?\?\[\]\)\.map\(skill=>/);
 assert.match(page,/onClick=\{\(\)=>castSkill\(skill\)\}/);
 assert.match(page,/!\s*constructionCenter/);
 assert.match(page,/Crear con \{skill\.name\}/);
 assert.doesNotMatch(page.split("\n").find(line=>line.includes("habilidad con efecto Crear"))??"",/Sikat[aā]|Fotoconstrucci[oó]n|Espejo/i);
});
test("karma, construction and skills are modal content, never always-visible encounter sections",()=>{
 for(const panel of ["karma","construction","skills","inventory","stats"])assert.ok(page.includes('open={panel==="'+panel+'"'),panel);
 assert.match(page,/<CombatDialog open=\{panel==="skills"\}/);
 assert.match(page,/categoryFilter=\{skillCategory\}/);
 assert.match(modal,/aria-modal=\{open\|\|undefined\}/);
 assert.match(modal,/Escape/);
 assert.match(modal,/onClick=\{onClose\}/);
});
test("defenses are icon buttons with pressed state rather than dense radio cards",()=>{
 assert.match(page,/const defenseIcons:Record<DefenseChoice/);
 assert.match(page,/role="group" aria-label="Opciones de defensa"/);
 assert.match(page,/aria-pressed=\{active\}/);
 assert.match(page,/<DefenseIcon size=\{24\}/);
 assert.doesNotMatch(page,/<input type="radio"/);
});
test("bad reach and initiative must remain explained instead of silently doing nothing",()=>{
 assert.match(page,/const basicOutOfRange=targetDistance>basicReach/);
 assert.match(page,/disabled=\{!ready\|\|basicOutOfRange/);
 assert.match(page,/El objetivo está a \{targetDistance\.toFixed\(2\)\} m/);
 assert.match(page,/const npcNeedsInitiative=Boolean/);
 assert.match(page,/command:\{kind:"ADVANCE"\}/);
 assert.match(page,/setActionFeedback\(event\?\.summary/);
 assert.match(page,/setConstructionCenter\(null\)/);
 const loadEffect=page.slice(page.indexOf("const load=useCallback"),page.indexOf("async function submit("));
 assert.doesNotMatch(loadEffect,/setError\(""\)/,"polling must not clear a rejected action");
 assert.match(loadout,/La habilidad está lista, pero debes esperar tu iniciativa/);
});
