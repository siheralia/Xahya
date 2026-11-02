const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");

const source=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
function load(file,dependencies={}){
 const moduleExports={};
 const transpiled=ts.transpileModule(source(file),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText;
 vm.runInNewContext(transpiled,{
   exports:moduleExports,
   require(name){
     if(Object.hasOwn(dependencies,name))return dependencies[name];
     throw new Error("Unexpected import "+name);
   },
   Object,Array,Number,String,Set,Math,Error,
 },{filename:file});
 return moduleExports;
}
const pricing=load("lib/skills/cooldown.ts");
const runtime=load("lib/skills/cooldown-runtime.ts",{
  "@/lib/skills/cooldown":pricing,
});

test("discount tiers are monotonic and use 1 PCH as minimum",()=>{
 const cds=[
  ["Sin cooldown",0],["1 turno",5],["2 turnos",10],["3 turnos",15],
  ["5 turnos",20],["10 turnos",30],["Una vez por combate",35],
 ];
 let previous=100;
 for(const [cooldown,discount] of cds){
  assert.equal(pricing.cooldownDiscountPercent(cooldown,"Instantánea","OFFENSIVE"),discount);
  const actual=pricing.applyCooldownPch(100,cooldown,"Instantánea","OFFENSIVE");
  assert.equal(actual,100-discount);
  assert.ok(actual<=previous);
  previous=actual;
 }
 assert.equal(pricing.applyCooldownPch(1,"Una vez por combate","Instantánea","OFFENSIVE"),1);
 assert.equal(pricing.applyCooldownPch(0,"10 turnos","Instantánea","OFFENSIVE"),0);
 assert.equal(pricing.applyCooldownPch(20,"3 turnos","Instantánea","OFFENSIVE"),17);
 assert.equal(pricing.applyCooldownPch(19,"3 turnos","Instantánea","OFFENSIVE"),17);
});

test("equal-duration uses finite duration up to maximum and does not discount infinite passives",()=>{
 assert.equal(pricing.cooldownDiscountPercent("Igual a duración","Instantánea","OFFENSIVE"),0);
 assert.equal(pricing.cooldownDiscountPercent("Igual a duración","No termina","OFFENSIVE"),0);
 assert.equal(pricing.cooldownDiscountPercent("Igual a duración","1 turno","OFFENSIVE"),5);
 assert.equal(pricing.cooldownDiscountPercent("Igual a duración","4 turnos","OFFENSIVE"),15);
 assert.equal(pricing.cooldownDiscountPercent("Igual a duración","20 turnos","OFFENSIVE"),30);
 assert.equal(pricing.cooldownTurns("Igual a duración","20 turnos"),20);
 assert.equal(pricing.applyCooldownPch(30,"10 turnos","No termina","PASSIVE"),30);
 assert.equal(pricing.applyCooldownPch(30,"Una vez por combate","No termina","PASSIVE"),30);
});

test("combat gate prevents restart during intervening turns and allows reactivation after recovery",()=>{
 const first=runtime.cooldownAvailability("2 turnos","Instantánea","OFFENSIVE",undefined,"COMBAT",4,10000);
 assert.equal(first.allowed,true);
 const ledger=runtime.recordSkillCooldown({},77,4,10000);
 assert.deepEqual(Object.keys(ledger),["77"]);
 assert.equal(runtime.cooldownAvailability("2 turnos","Instantánea","OFFENSIVE",ledger["77"],"COMBAT",4,11000).allowed,false);
 assert.equal(runtime.cooldownAvailability("2 turnos","Instantánea","OFFENSIVE",ledger["77"],"COMBAT",6,12000).remainingTurns,1);
 assert.equal(runtime.cooldownAvailability("2 turnos","Instantánea","OFFENSIVE",ledger["77"],"COMBAT",7,12000).allowed,true);
});

test("equal-to-duration cooldown is recorded after stopping an active skill",()=>{
 const route=source("app/api/characters/[id]/skills/tick/route.ts");
 assert.match(route,/action==="stop" && existing\?\.active && skill\.cooldown==="Igual a duración"/);
 assert.match(route,/action==="start" && \(skill\.cooldown==="Una vez por combate"/);
});

test("once per combat is only usable once in each encounter",()=>{
 const unspent=runtime.cooldownAvailability("Una vez por combate","Instantánea","OFFENSIVE",undefined,"COMBAT",1,10000);
 assert.equal(unspent.allowed,true);
 const spent=runtime.cooldownAvailability("Una vez por combate","Instantánea","OFFENSIVE",{turn:1,at:10000},"COMBAT",99,1000000);
 assert.equal(spent.allowed,false);
 assert.equal(spent.reason,"COOLDOWN_ACTIVE");
 const outside=runtime.cooldownAvailability("Una vez por combate","Instantánea","OFFENSIVE",undefined,"PERSONAL",0,10000);
 assert.equal(outside.reason,"COOLDOWN_COMBAT_ONLY");
});

test("outside combat respects elapsed wall-clock time (100s per turn)",()=>{
 const stamp={turn:0,at:1000};
 const before=runtime.cooldownAvailability("1 turno","Instantánea","OFFENSIVE",stamp,"PERSONAL",0,51000);
 assert.equal(before.allowed,false);
 assert.equal(before.remainingTurns,1);
 assert.equal(runtime.cooldownAvailability("1 turno","Instantánea","OFFENSIVE",stamp,"PERSONAL",0,101000).allowed,true);
});

test("server and editors all apply same cooldown adjustment before requirements",()=>{
 for(const file of [
   "lib/skills/upgrade.ts",
   "app/api/characters/[id]/skills/route.ts",
   "lib/skills/generic-preview.ts",
   "app/management/skills/page.tsx",
   "app/characters/[id]/page.tsx",
 ]){
  const s=source(file);
  assert.match(s,/applyCooldownPch\(/,file);
  assert.match(s,/effectRequirementDiscount\(/,file);
 }
 const modal=source("components/skills/SkillFormModal.tsx");
 assert.match(modal,/cooldownSaved/);
 assert.match(modal,/afterCooldown-pch.total/);
 assert.match(modal,/cooldownPercent/);
});

test("activation persists cooldown to environment and refuses repeat use",()=>{
 const tick=source("app/api/characters/[id]/skills/tick/route.ts");
 const engine=source("lib/skills/interaction-engine.ts");
 assert.match(tick,/cooldownAvailability\(/);
 assert.match(tick,/recordSkillCooldown\(/);
 assert.match(tick,/await saveSkillEnvironment\(/);
 assert.match(tick,/COOLDOWN_COMBAT_ONLY/);
 assert.match(engine,/cooldowns:.*input.cooldowns/);
 assert.match(engine,/cooldowns:.*raw.cooldowns/);
});

test("combat turn update cannot erase a skill cooldown stamped concurrently",()=>{
 const route=source("app/api/combat/[id]/route.ts");
 assert.match(route,/freshEncounter=await TxSession\.where\(\{id\}\)\.first\(\)/);
 assert.match(route,/advanceCombatMechanics\(freshEncounter\.mechanicsState/);
 assert.match(route,/UPDATE public\."character" SET id=id/);
});

test("racial grant cost remains zero and cooldown is propagated by its catalog trigger",()=>{
 const migration=source("supabase/migrations/20261102203000_racial_skill_cooldown.sql");
 assert.match(migration,/ADD COLUMN IF NOT EXISTS cooldown/);
 assert.match(migration,/cooldown=rs.cooldown/);
 assert.match(migration,/"pchCost"=0/);
 const racial=source("lib/skills/racial-catalog.ts");
 assert.match(racial,/COOLDOWN_OPTIONS/);
 assert.match(racial,/cooldown:string/);
});
