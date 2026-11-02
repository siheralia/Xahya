const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const readModule = file => {
  const exports = {};
  const js = ts.transpileModule(source(file), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(js,{exports, Object, Number, String, Array}, {filename:file});
  return exports;
};

const {catalogEffectIcons,effectIconKey,resolveSkillEffectIcon} = readModule("lib/skills/emblem-icons.ts");
const {formatSkillForClipboard} = readModule("lib/skills/skill-clipboard.ts");

test("narrative skill cards use the exact icon configured for their narrative card",()=>{
  const icons = catalogEffectIcons(
    [{type:"NARRATIVE",icon:"sparkles"},{type:"DAMAGE_MULTIPLIER",icon:"swords"}],
    [{id:"W002",icon:"plus"},{id:"W006",icon:"brick-wall"}]
  );
  assert.equal(icons["CARD:W002"],"plus");
  assert.equal(icons["CARD:W006"],"brick-wall");
  assert.equal(effectIconKey({type:"NARRATIVE",target:"CARD:W006"}),"CARD:W006");
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:W002"},undefined,icons),"plus");
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:W006"},undefined,icons),"brick-wall");
  assert.equal(resolveSkillEffectIcon({type:"DAMAGE_MULTIPLIER"},undefined,icons),"swords");
});

test("narrative and mechanical effect icons preserve fallback and explicit overrides",()=>{
  const icons = catalogEffectIcons([{type:"NARRATIVE",icon:"sparkles"}],[{id:"W006",icon:"brick-wall"}]);
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:missing"},undefined,icons),"sparkles");
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:W006"},{"CARD:W006":"shield-half"},icons),"shield-half");
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:W006"},{NARRATIVE:"star"},icons),"brick-wall");
  assert.equal(resolveSkillEffectIcon({type:"NARRATIVE",target:"CARD:W006"},undefined,{"NARRATIVE":"sparkles"}),"sparkles");
});

test("clipboard output includes only one skill, full description, condition, requirements and effects",()=>{
  const text = formatSkillForClipboard({
    name:"Resistencia no newtoniana",category:"PASSIVE",status:"APPROVED",
    cost:0,pchCost:10,description:"La arena endurece ante impactos.",
    duration:"No termina",areaOfEffect:"Arena de Sikatā | Alcance máximo: 5 m",
    condition:"Requiere Sikatā y arena creada mediante ella.",
    mechanics:{family:"SIKATA",parentSkillId:14},
    effect:[{type:"NARRATIVE",target:"CARD:W006",element:"NEUTRAL",description:"Endurecer materia: Aumenta resistencia física de un material"}],
    effectRequirements:[{effect:"CREATE",element:"EARTH"}]
  },{effects:{CREATE:"Crear"}});
  assert.match(text,/\*HABILIDAD: Resistencia no newtoniana\*/);
  assert.match(text,/Categoría: Pasiva/);
  assert.match(text,/Estado: Aprobada/);
  assert.match(text,/Maná por uso: 0/);
  assert.match(text,/Costo de construcción: 10 PCH/);
  assert.match(text,/Condición: Requiere Sikatā/);
  assert.match(text,/Familia: SIKATA/);
  assert.match(text,/Habilidad madre: #14/);
  assert.match(text,/Endurecer materia: Aumenta resistencia/);
  assert.match(text,/Crear \+ EARTH/);
});

test("unpriced and pending skills can also be copied cleanly",()=>{
  const text=formatSkillForClipboard({
    name:"Nueva técnica",category:"UTILITY",status:"PENDING",cost:20,
    effect:[{type:"STAT_BONUS",target:"AGI",value:4,element:"EARTH"}]
  },{effects:{STAT_BONUS:"Bono de estadística"},targets:{AGI:"Agilidad"}});
  assert.match(text,/Pendiente de aprobación/);
  assert.match(text,/Bono de estadística · Agilidad · Potencia: 4 · Elemento: EARTH/);
  assert.doesNotMatch(text,/Costo de construcción:/);
});

test("emblem endpoint exposes card icon mapping and UI uses it",()=>{
  const api=source("app/api/effect-icons/route.ts");
  const emblem=source("app/components/skill-emblem.tsx");
  assert.match(api,/catalogEffectIcons\(effects,narrativeCards\)/);
  assert.match(emblem,/resolveSkillEffectIcon\(effect,icons,managedIcons\)/);
  assert.match(emblem,/fetch\("\/api\/effect-icons",\{cache:"no-store"\}\)/);
});

test("skill card titles are high contrast and copy buttons are present for approved and pending skills",()=>{
  const sheet=source("app/characters/[id]/page.tsx");
  assert.match(sheet,/text-base font-semibold text-zinc-100"\>\{skill.name\}/);
  assert.doesNotMatch(sheet,/<h3 className="font-semibold" style=\{\{ color: themePalette.foreground \}\}>\{skill.name\}/);
  assert.match(sheet,/async function copySkillToClipboard\(skill: Skill\)/);
  assert.match(sheet,/navigator.clipboard.writeText\(formatSkillForClipboard\(skill/);
  assert.equal((sheet.match(/onClick=\{\(\)=>copySkillToClipboard\(skill\)\}/g)??[]).length,2);
});
