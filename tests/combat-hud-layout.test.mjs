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
test("karma, skills, inventory and stats are dialogs, while construction uses accessible dual planes",()=>{
 for(const panel of ["karma","skills","inventory","stats"])assert.ok(page.includes('open={panel==="'+panel+'"'),panel);
 assert.match(page,/panel==="construction"&&canCreateObjects&&state.status==="ACTIVE"/);
 assert.match(page,/Plano horizontal · terreno/);
 assert.match(page,/Plano vertical · altura/);
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
 assert.match(page,/const basicOutOfRange=attackDistance>basicReach/);
 assert.match(page,/const canExecuteAttack=/);
 assert.match(page,/disabled=\{!canExecuteAttack\("BEFORE"\)\}/);
 assert.match(page,/El objetivo está a \{attackDistance\.toFixed\(2\)\} m/);
 assert.match(page,/const npcNeedsInitiative=Boolean/);
 assert.match(page,/command:\{kind:"ADVANCE",requestId:"npc-advance-"\+key\}/);
 assert.match(page,/setActionFeedback\(event\?\.summary/);
 assert.match(page,/setConstructionCenter\(null\)/);
 const loadEffect=page.slice(page.indexOf("const load=useCallback"),page.indexOf("async function submit("));
 assert.doesNotMatch(loadEffect,/setError\(""\)/,"polling must not clear a rejected action");
 assert.match(loadout,/La habilidad está lista, pero debes esperar tu iniciativa/);
});

test("character flair stays on one line inside a wider emblem badge",()=>{
 assert.match(hud,/h-14 w-\[88px\] shrink-0/);
 assert.match(hud,/whitespace-nowrap text-base leading-none sm:text-lg/);
 assert.match(hud,/aria-label="Emblema del personaje"/);
 assert.match(hud,/\{"⟨"\+flair\+"⟩"\}/);
 assert.doesNotMatch(hud,/h-14 w-16 shrink-0/);
});


test("mobile combat actions remain attached to the right canvas, with aligned toolbars and short labels",()=>{
 const planes=page.indexOf('aria-label="Dos planos del combate"');
 const actionRow=page.indexOf('aria-label="Acciones junto al plano vertical"');
 const expanded=page.indexOf('title="Opciones avanzadas del ataque"');
 assert.ok(planes>=0&&actionRow>planes,"the attack controls are inside the dual-plane grid");
 assert.ok(expanded>actionRow,"verbose details live outside the canvas in a dialog");
 for(const label of ["Solo mover · 1 PA","Mover y atacar · 2 PA","Atacar y mover · 2 PA","Solo atacar · 1 PA"])
  assert.ok(page.includes(label),label);
 assert.doesNotMatch(page,/min-h-8 text-\[10px\] text-cyan-200/,"no mode label can offset the left canvas");
 assert.doesNotMatch(page,/Siguiente acción/,"the former long action section is not visible");
 assert.match(page,/const suggestedMove=/);
 assert.match(page,/setFieldMove\(suggestedMove\)/,"choosing a composite mode previews the suggested step");
 assert.match(page,/move=\{fieldMove\?\?/,"the movement remains visible before confirmation");
 assert.match(page,/open=\{constructionOptionsOpen&&panel==="construction"\}/);
 assert.match(page,/opponentCardRef/);
 assert.match(page,/!opponentInView&&/);
});


test("mobile equipment audit: show numeric condition before fold, collapse optional explanation",()=>{
 const equipment=readFileSync(new URL("../app/combat/[id]/CombatEquipmentStatus.tsx",import.meta.url),"utf8");
 const summary=equipment.indexOf("{counts.total} piezas equipadas");
 const details=equipment.indexOf("<details className=");
 const cards=equipment.indexOf("{(fighter.equippedWearables??[]).map");
 assert.ok(summary>=0&&details>summary&&cards>details,
  "counts and current pools must appear before optional explanatory prose and item cards");
 assert.match(equipment,/<summary className="cursor-pointer/);
 assert.match(equipment,/¿Por qué cambia la durabilidad\?/);
 assert.match(equipment,/Bloquear desgasta el arma o escudo utilizado/);
 assert.doesNotMatch(equipment,/open=\{true\}/,
  "long explanations must be collapsed by default on narrow screens");
});
