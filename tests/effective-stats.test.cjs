// Regression tests for the shared statistics resolver. Run: node --test tests/effective-stats.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const resolverSource = fs.readFileSync(path.join(__dirname, "../lib/stats/effective.ts"), "utf8");
const js = ts.transpileModule(resolverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const wearableBonusSource=fs.readFileSync(path.join(__dirname,
  "../lib/combat/wearable-stat-bonus.ts"),"utf8");
const wearableBonusJs=ts.transpileModule(wearableBonusSource,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const wearableBonusModule={};
vm.runInNewContext(wearableBonusJs,{exports:wearableBonusModule,require:()=>({})});
const equipmentReplaySource=fs.readFileSync(path.join(__dirname,
  "../lib/combat/equipment-derived-replay.ts"),"utf8");
const equipmentReplayJs=ts.transpileModule(equipmentReplaySource,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const equipmentReplayModule={};
vm.runInNewContext(equipmentReplayJs,{
  exports:equipmentReplayModule,
  require:(name)=>name==="./wearable-stat-bonus.ts"?wearableBonusModule:{},
});
const resourceReplaySource=fs.readFileSync(path.join(__dirname,
  "../lib/combat/equipment-resource-replay.ts"),"utf8");
const resourceReplayJs=ts.transpileModule(resourceReplaySource,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const resourceReplayModule={};
vm.runInNewContext(resourceReplayJs,{
  exports:resourceReplayModule,require:()=>({}),
});

// Test fixture: these entries model an active catalog; production definitions remain in AppSetting.
const ACTIVE_ATTACK_CATALOG = [
  { key: "physicalAttack", code: "PHYS_ATK", kind: "derived", active: true },
  { key: "magicAttack", code: "MAG_ATK", kind: "derived", active: true },
];

function resolver({ catalog = ACTIVE_ATTACK_CATALOG, legacy = { strength: 100, agility: 20, constitution: 20, intelligence: 20, wisdom: 20, charisma: 20, spirit: 20, luck: 20 }, modifiers = [], items = [], owned = [], perks = [], assigned = [], skills = [], combat = false, derived = {}, mechanicFactors = {} } = {}) {
  const tables = {
    CharacterStat: [{ characterId: 1, ...legacy }],
    CharacterStatValue: [],
    CharacterModifier: modifiers,
    CharacterItem: owned,
    Item: items,
    CharacterPerk: assigned,
    Perk: perks,
    Skill: skills.map(skill=>({characterId:1,...skill})),
  };
  const source = { orm: { public: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    where: (criteria) => ({
      first: async () => rows.find((row) => Object.entries(criteria).every(([key, value]) => row[key] === value)) ?? null,
      all: async () => rows.filter((row) => Object.entries(criteria).every(([key, value]) => row[key] === value)),
    }),
    all: async () => rows,
  }])) } };
  const dependencies = {
    "@/lib/db": { db: source },
    "@/lib/stats/dynamic": { readStatisticsCatalog: async () => catalog, CORE_BASIC_STAT_KEYS: new Set(["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"]) },
    "@/lib/stats/engine": { calculateConfiguredDerivedStats: async (base) => ({ maxHp: 100, maxMana: 100, physicalAttack: base.strength, magicAttack: 50, dodge: base.agility + 5, ...derived }) },
    "@/lib/stats/derived": { applyDerivedItemEffects: (base, effects) => {
      const result = { ...base };
      for (const effect of effects) {
        if (!(effect.stat in result)) continue;
        if (effect.type === "stat_bonus") result[effect.stat] += effect.value;
        if (effect.type === "stat_multiplier") result[effect.stat] *= effect.value;
      }
      return result;
    } },
    "@/lib/perks": { getPerkEffects: (entries) => entries.flatMap((entry) => entry.perk?.effects ?? []) },
    "@/lib/skills/interaction-engine": {parseEnvironment:(v)=>v??{}, activeStatMultipliers:()=>mechanicFactors},
    "@/lib/combat/wearable-stat-bonus":wearableBonusModule,
    "@/lib/combat/equipment-derived-replay":equipmentReplayModule,
    "@/lib/combat/equipment-resource-replay":resourceReplayModule,
    // The true DB-free basic replay is integration-tested directly in ESM.
    // Existing fixture stubs derived formulas rather than evaluating a real catalog.
    "@/lib/combat/equipment-basic-replay":{buildEquipmentBasicReplay:()=>null},
  };
  const moduleExports = {};
  vm.runInNewContext(js, { exports: moduleExports, require: (id) => {
    if (!(id in dependencies)) throw new Error("Unexpected import: " + id);
    return dependencies[id];
  }, Date, Set, Number, Object, Array, String });
  return combat ? moduleExports.getEffectiveCombatCharacterStats(1, source) : moduleExports.getEffectiveCharacterStats(1, source);
}

test("karma and equipped item bonuses are each applied once", async () => {
  const result = await resolver({
    modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST" }],
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.effectiveStats.strength, 130);
  assert.equal(result.derived.physicalAttack, 130);
  assert.equal(result.statBreakdown.strength.karmaBonus, 20);
});

test("unequipped objects do not grant bonuses", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: false }],
  });
  assert.equal(result.effectiveStats.strength, 100);
});

test("expired karma boosts are ignored", async () => {
  const result = await resolver({ modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: "2000-01-01T00:00:00.000Z" }] });
  assert.equal(result.effectiveStats.strength, 100);
});

test("inactive stat targets remain stored but do not affect derived values", async () => {
  const result = await resolver({
    catalog: [{ key: "maxHp", code: "HP", kind: "derived", active: false }],
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "HP", value: 200 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.derived.maxHp, 100);
});

test("attack-total object multiplier is applied once in resolver", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_multiplier", stat: "ATTACK_TOTAL", value: 2 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.derived.physicalAttack, 200);
  assert.equal(result.derived.magicAttack, 100);
});

test("derived item bonus does not reapply a basic stat bonus", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }, { type: "stat_bonus", stat: "PHYS_ATK", value: 5 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.effectiveStats.strength, 110);
  assert.equal(result.derived.physicalAttack, 115);
});

test("literal x2 basic and x1.5 derived factors", async () => {
 const result = await resolver({items:[{id:1,effects:[{type:"stat_multiplier",stat:"STR",value:2},{type:"stat_multiplier",stat:"PHYS_ATK",value:1.5}]}],owned:[{characterId:1,itemId:1,equipped:true}]});
 assert.equal(result.effectiveStats.strength,200);
 assert.equal(result.derived.physicalAttack,300);
});

test("active karma boost applies +20 until its seven-day expiration", async () => {
  const startedAt = Date.now();
  const expiresAt = new Date(startedAt + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await resolver({
    modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt }],
  });
  assert.equal(result.effectiveStats.strength, 120);
  assert.equal(result.statBreakdown.strength.karmaBonus, 20);
});

test("karma boost at its expiration boundary is no longer applied", async () => {
  const result = await resolver({
    modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: new Date(Date.now() - 1000).toISOString() }],
  });
  assert.equal(result.effectiveStats.strength, 100);
  assert.equal(result.statBreakdown.strength.karmaBonus, 0);
});

test("two overlapping active karma boosts accumulate without affecting expired boosts", async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const result = await resolver({
    modifiers: [
      { characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: future },
      { characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: future },
      { characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: "2000-01-01T00:00:00.000Z" },
    ],
  });
  assert.equal(result.effectiveStats.strength, 140);
  assert.equal(result.statBreakdown.strength.karmaBonus, 40);
});


test("mechanical statuses modify effective basic stats and derived attack inputs",async()=>{
 const value=await resolver({mechanicFactors:{STR:0.8,AGI:1.5}});
 assert.equal(value.effectiveStats.strength,80);
 assert.equal(value.effectiveStats.agility,30);
 assert.equal(value.derived.physicalAttack,80);
});


const COMBAT_STATS_CATALOG=[
  ...ACTIVE_ATTACK_CATALOG,
  {key:"dodge",code:"DODGE",kind:"derived",active:true},
];

test("Capoeira #37 grants exactly ×1.5 Esquiva in a combat snapshot, not the character sheet",async()=>{
 const skill={id:37,characterId:1,name:"Capoeira",category:"PASSIVE",status:"APPROVED",
   condition:"Mientras esté en combate",mechanics:{family:"CAPOEIRA"},
   effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:150}]};
 const options={catalog:COMBAT_STATS_CATALOG,skills:[skill],derived:{dodge:14.5}};
 const regular=await resolver(options);
 const combat=await resolver({...options,combat:true});
 assert.equal(regular.derived.dodge,14.5);
 assert.equal(combat.derived.dodge,21.75);
 assert.equal(combat.derivedStatMultipliers.dodge,1.5);
 assert.equal(combat.effectiveStats.agility,20);
});

test("approved passive ×1.5 AGI is applied before derived statistics and combat speed",async()=>{
 const skill={id:401,characterId:1,name:"Reflejos rápidos",category:"PASSIVE",status:"APPROVED",
   effect:[{type:"STAT_MULTIPLIER",target:"AGI",value:150}]};
 const regular=await resolver({skills:[skill],legacy:{strength:100,agility:11,constitution:20,intelligence:20,wisdom:20,charisma:20,spirit:20,luck:20}});
 const combat=await resolver({skills:[skill],combat:true,
   legacy:{strength:100,agility:11,constitution:20,intelligence:20,wisdom:20,charisma:20,spirit:20,luck:20}});
 assert.equal(regular.effectiveStats.agility,11);
 assert.equal(combat.effectiveStats.agility,16.5);
 assert.equal(combat.derived.dodge,21.5);
 assert.equal(Math.ceil(1000/regular.effectiveStats.agility),91);
 assert.equal(Math.ceil(1000/combat.effectiveStats.agility),61);
 const duelRoute=fs.readFileSync(path.join(__dirname,"../app/api/combat/duels/route.ts"),"utf8");
 assert.match(duelRoute,/getEffectiveCombatCharacterStats\(characterId\)/);
 assert.match(duelRoute,/getEffectiveCombatCharacterStats\(opponentId\)/);
 assert.match(duelRoute,/player\.speedValue=numeric\(first\.effectiveStats\[mechanics\.combatSpeed\]/);
});

test("combat passive stat effects stack additively with equipment and perks and never duplicate a skill id",async()=>{
 const skills=[
  {id:11,status:"APPROVED",category:"PASSIVE",effect:[{type:"STAT_MULTIPLIER",target:"STR",value:150}]},
  {id:11,status:"APPROVED",category:"PASSIVE",effect:[{type:"STAT_MULTIPLIER",target:"STR",value:150}]},
 ];
 const stats=await resolver({skills,combat:true,items:[{id:1,effects:[{type:"stat_multiplier",stat:"STR",value:2}]}],
  owned:[{characterId:1,itemId:1,equipped:true}]});
 assert.equal(stats.effectiveStats.strength,350,"×2 + ×1.5 = ×3.5");
 assert.equal(stats.derived.physicalAttack,350);
});

test("pending, unsupported conditional, advanced and perk-granted passives cannot silently apply",async()=>{
 const skills=[
  {id:1,status:"PENDING",category:"PASSIVE",effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:2,status:"APPROVED",category:"OFFENSIVE",effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:3,status:"APPROVED",category:"PASSIVE",condition:"Solo mientras esté lloviendo",effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:4,status:"APPROVED",category:"PASSIVE",mechanics:{activationConditions:[{kind:"STATUS",status:"X"}]},effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:5,status:"APPROVED",category:"PASSIVE",effectRequirements:[{type:"UNKNOWN"}],effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:6,status:"APPROVED",category:"PASSIVE",grantedByRacePerkId:12,effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
  {id:7,status:"APPROVED",category:"PASSIVE",effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:Infinity}]},
  {id:8,status:"APPROVED",category:"PASSIVE",effect:[{type:"STAT_MULTIPLIER",target:"UNKNOWN",value:200}]},
  {id:9,status:"APPROVED",category:"PASSIVE",requiredSkillIds:[999],effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:200}]},
 ];
 const stats=await resolver({catalog:COMBAT_STATS_CATALOG,skills,combat:true,derived:{dodge:14.5}});
 assert.equal(stats.derived.dodge,14.5);
});

test("combat-only static race-skill numeric bonuses count once; inactive derived targets stay disabled",async()=>{
 const skill={id:19,status:"APPROVED",category:"PASSIVE",grantedByRaceSkillId:3,
  effect:[{type:"STAT_BONUS",target:"DODGE",value:5},{type:"STAT_BONUS",target:"STR",value:10}]};
 const stats=await resolver({catalog:COMBAT_STATS_CATALOG,skills:[skill],combat:true,derived:{dodge:14.5}});
 assert.equal(stats.derived.dodge,19.5);
 assert.equal(stats.effectiveStats.strength,110);
 const inactive=await resolver({catalog:COMBAT_STATS_CATALOG.map(s=>s.key==="dodge"?{...s,active:false}:s),
  skills:[skill],combat:true,derived:{dodge:14.5}});
 assert.equal(inactive.derived.dodge,14.5,"disabled derived stats are not secretly buffed");
 assert.equal(inactive.effectiveStats.strength,110);
});

test("combat karma boost delta reuses passive-aware stat snapshot",()=>{
 const actions=fs.readFileSync(path.join(__dirname,"../app/api/combat/[id]/actions/route.ts"),"utf8");
 assert.match(actions,/getEffectiveCombatCharacterStats\(characterId,tx\)/);
 assert.match(actions,/derivedStatMultipliers\[key\]/);
});

test("combat stat resolver snapshots direct item bonuses with the true final mechanic and attack factors",async()=>{
 const result=await resolver({
  combat:true,
  catalog:[
   {key:"physicalAttack",code:"PHYS_ATK",kind:"derived",active:true},
   {key:"magicDefense",code:"MAG_DEF",kind:"derived",active:true},
  ],
  items:[{id:10,itemType:"ARMOR",effects:[
   {type:"stat_bonus",stat:"PHYS_ATK",value:5},
   {type:"stat_bonus",stat:"MAG_DEF",value:3},
   {type:"stat_bonus",stat:"STR",value:12},
  ]},{id:11,itemType:"ACCESSORY",effects:[
   {type:"stat_multiplier",stat:"ATTACK_TOTAL",value:2},
  ]}],
  owned:[
   {id:101,characterId:1,itemId:10,quantity:1,equipped:true},
   {id:102,characterId:1,itemId:11,quantity:1,equipped:true},
  ],
  mechanicFactors:{PHYS_ATK:1.5},
  derived:{magicDefense:50},
 });
 assert.equal(result.derived.physicalAttack,(112+5)*1.5*2);
 assert.equal(result.derived.magicDefense,53);
 assert.equal(result.combatWearableStatBonuses.length,1);
 const copy=result.combatWearableStatBonuses[0];
 assert.equal(copy.characterItemId,101);
 assert.equal(copy.itemId,10);
 assert.equal(copy.bonuses.physicalAttack,15);
 assert.equal(copy.bonuses.magicDefense,3);
 assert.equal(copy.bonuses.strength,undefined,"base stats are not approximated");
});

test("noncombat stats do not carry mutable combat equipment snapshots",async()=>{
 const result=await resolver({items:[{id:1,itemType:"ARMOR",effects:[
  {type:"stat_bonus",stat:"PHYS_ATK",value:7}
 ]}],owned:[{id:101,characterId:1,itemId:1,quantity:1,equipped:true}]});
 assert.equal(result.derived.physicalAttack,107);
 assert.equal(result.combatWearableStatBonuses.length,0);
});

test("combat derived model replays whole item and ATTACK_TOTAL factors, not an inverse ratio",async()=>{
 const result=await resolver({combat:true,
  items:[
   {id:10,itemType:"ARMOR",effects:[
    {type:"stat_multiplier",stat:"PHYS_ATK",value:2},
    {type:"stat_bonus",stat:"PHYS_ATK",value:5}]},
   {id:11,itemType:"ACCESSORY",effects:[
    {type:"stat_multiplier",stat:"ATTACK_TOTAL",value:1.5}]},
  ],
  owned:[
   {id:101,characterId:1,itemId:10,quantity:1,equipped:true},
   {id:102,characterId:1,itemId:11,quantity:1,equipped:true},
  ],
 });
 assert.equal(result.derived.physicalAttack,307.5);
 assert.equal(result.derived.magicAttack,75);
 const model=result.combatEquipmentDerivedReplay;
 assert.ok(model,"the model must match the live configured stats exactly");
 assert.equal(model.copies.length,2);
 const all=equipmentReplayModule.evaluateEquipmentDerived(model,new Set([101,102]));
 assert.equal(all.physicalAttack,307.5);
 assert.equal(all.magicAttack,75);
 const brokenArmor=equipmentReplayModule.evaluateEquipmentDerived(model,new Set([102]));
 assert.equal(brokenArmor.physicalAttack,150);
 assert.equal(brokenArmor.magicAttack,75);
 const brokenAccessory=equipmentReplayModule.evaluateEquipmentDerived(model,new Set([101]));
 assert.equal(brokenAccessory.physicalAttack,205);
 assert.equal(brokenAccessory.magicAttack,50);
});

test("regular sheets do not return a combat factor replay or change legacy calculations",async()=>{
 const result=await resolver({
  items:[{id:1,itemType:"ARMOR",effects:[
   {type:"stat_multiplier",stat:"PHYS_ATK",value:2},
  ]}],owned:[{id:100,characterId:1,itemId:1,quantity:1,equipped:true}],
 });
 assert.equal(result.derived.physicalAttack,200);
 assert.equal(result.combatEquipmentDerivedReplay,null);
});

test("combat stat resolver tracks armor HP/mana maxima without losing perk resource bonuses",async()=>{
 const catalog=[...ACTIVE_ATTACK_CATALOG,
  {key:"maxHp",code:"HP",kind:"derived",active:true},
  {key:"maxMana",code:"MANA",kind:"derived",active:true}];
 const result=await resolver({combat:true,catalog,
  items:[{id:20,itemType:"ARMOR",effects:[
   {type:"stat_bonus",stat:"HP",value:20},
   {type:"stat_multiplier",stat:"MANA",value:1.5},
  ]}],
  owned:[{id:120,characterId:1,itemId:20,quantity:1,equipped:true}],
  perks:[{id:60,effects:[
   {type:"RESOURCE_BONUS",target:"HP",value:30},
   {type:"RESOURCE_BONUS",target:"MANA",value:5},
  ]}],
  assigned:[{characterId:1,perkId:60}],
 });
 assert.equal(result.derived.maxHp,150);
 assert.equal(result.derived.maxMana,157.5);
 const replay=result.combatEquipmentDerivedReplay?.resourceReplay;
 assert.ok(replay,"the snapshot reproduces the live stat resolver");
 assert.equal(replay.applied.maxHp,150);
 assert.equal(replay.applied.maxMana,157.5);
 assert.equal(replay.formulas.maxHp.external,30);
 assert.equal(replay.formulas.maxMana.external,5);
 const bare=resourceReplayModule.evaluateEquipmentResources(replay,new Set());
 assert.equal(bare.maxHp,130,"the racial perk survives armor breakage");
 assert.equal(bare.maxMana,105);
});

test("ordinary character sheets keep resource maxima but do not expose combat resource replay",async()=>{
 const result=await resolver({
  catalog:[...ACTIVE_ATTACK_CATALOG,
   {key:"maxHp",code:"HP",kind:"derived",active:true}],
  items:[{id:1,itemType:"ARMOR",effects:[
   {type:"stat_bonus",stat:"HP",value:12},
  ]}],
  owned:[{id:120,characterId:1,itemId:1,quantity:1,equipped:true}],
 });
 assert.equal(result.derived.maxHp,112);
 assert.equal(result.combatEquipmentDerivedReplay,null);
});
