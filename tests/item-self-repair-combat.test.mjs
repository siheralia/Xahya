import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  AUTO_REPAIR_ITEM_EFFECT,compileWeaponAutoRepair,defaultWeaponAutoRepair,
  evaluateWeaponAutoRepair,shouldAutoRepairAtRound,
} from "../lib/items/auto-repair.ts";
import {newCombatState,applyCombatCommand,canAct,defaultAttackSource,
  applyWeaponSelfRepairAtRoundStart} from "../lib/combat/turn-engine.ts";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const weapon=(name,durability,id=610)=>({
 name,attackType:"CUT",mode:"MELEE",effectiveRangeMeters:1.5,
 maximumRangeMeters:1.5,itemId:id,characterItemId:id+1000,durability,
 autoRepair:defaultWeaponAutoRepair(),
});
const fighter=(name,id,pos,overrides={})=>({
 characterId:id,name,hp:100,maxHp:100,agility:60,speedValue:80,
 strength:30,constitution:12,precision:60,dodge:15,physicalAttack:40,
 physicalDefense:20,magicAttack:30,magicDefense:42,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 attackType:"CUT",defenseType:"SOLID",weaponIntegrity:75,
 spentTicks:0,spentAp:0,...overrides
});
const encounter=(p=weapon("Espada encantada",75))=>{
 const s=newCombatState(
  fighter("Herrero",11,0,{equippedWeapon:p}),
  fighter("Oponente",22,3,{equippedWeapon:undefined})
 );
 s.mana={PLAYER:{current:20,max:20},NPC:{current:10,max:10}};
 return s;
};
const nextRound=start=>{
  const expected=start.round+1;
  let state=start;
  for(let i=0;i<24&&state.round<expected;i++){
    const side=canAct(state,"PLAYER")?"PLAYER":canAct(state,"NPC")?"NPC":null;
    if(!side)throw new Error("Ningún combatiente disponible para avanzar el turno");
    state=applyCombatCommand(state,side,{kind:"WAIT"});
  }
  assert.equal(state.round,expected,"each round must advance via legitimate WAIT actions");
  return state;
};

test("catalog validator requires positive mana and legal rate; no free unlimited repair",()=>{
 const effect=defaultWeaponAutoRepair();
 assert.equal(effect.type,AUTO_REPAIR_ITEM_EFFECT);
 assert.equal(compileWeaponAutoRepair([effect],"WEAPON")?.manaCost,5);
 assert.deepEqual(compileWeaponAutoRepair([],"WEAPON"),null);
 for(const val of [0,-1,1.5,1001,NaN]){
  assert.throws(()=>compileWeaponAutoRepair([{...effect,manaCost:val}],"WEAPON"),/maná positivo/);
 }
 for(const val of [0,51,1.5,NaN]){
  assert.throws(()=>compileWeaponAutoRepair([{...effect,intervalTurns:val}],"WEAPON"),/intervalo/);
 }
 assert.throws(()=>compileWeaponAutoRepair([effect,effect],"WEAPON"),/un efecto/);
 assert.throws(()=>compileWeaponAutoRepair([effect],"ARMOR"),/un efecto por arma/);
 assert.throws(()=>compileWeaponAutoRepair([{...effect,exploitable:true}],"WEAPON"),/desconocidos/);
});

test("only self item may be read and only one allowlisted effect family can act",()=>{
 const base=defaultWeaponAutoRepair();
 for(const step of [
  {kind:"READ_ITEM",selector:"SELECTED_ITEM",output:"sourceItem"},
  {kind:"READ_ITEM",selector:"OWNER_OFF_HAND",output:"sourceItem"},
  {kind:"HEAL",amount:99},
  {kind:"DAMAGE",channel:"MAGICAL",amount:100},
  {kind:"CONSUME",accumulator:"STACK",output:"free",charges:"ALL"},
 ]){
  assert.throws(()=>compileWeaponAutoRepair([{
   ...base,module:{...base.module,steps:[step,...base.module.steps]},
  }],"WEAPON"),/autorreparación|salida de objeto|inválido|lectura/);
 }
 assert.throws(()=>compileWeaponAutoRepair([{
  ...base,module:{...base.module,trigger:"PASSIVE"},
 }],"WEAPON"),/inicio del turno/);
 assert.throws(()=>compileWeaponAutoRepair([{
  ...base,module:{...base.module,steps:[
   base.module.steps[0],
   {kind:"CALCULATE",output:"energy",expression:{source:"CHARGES",key:"STACK"}},
   {...base.module.steps[2],amount:{source:"OUTPUT",key:"energy"}},
  ]},
 }],"WEAPON"),/fuentes numéricas/);
});

test("item graph varies its amount by live combat statistics but cannot target someone else's item",()=>{
 const rule=defaultWeaponAutoRepair();
 rule.module.steps[1]={kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"repairAmount"};
 const projection=evaluateWeaponAutoRepair(rule,{characterItemId:1610,durability:92},
  {HP:100,MAX_HP:100,magicDefense:18});
 assert.equal(projection.restored,8);
 assert.equal(projection.after,100);
 assert.deepEqual(projection.intents.map(x=>x.characterItemId),[1610]);
 assert.equal(evaluateWeaponAutoRepair(rule,{characterItemId:1610,durability:100},
  {HP:100,MAX_HP:100,magicDefense:18}).restored,0);
});

test("turn advance repairs only equipped weapon's exact copy and debits encounter mana",()=>{
 const original=encounter();
 assert.equal(original.round,1);
 assert.equal(original.actors.PLAYER.equippedWeapon.durability,75);
 const next=nextRound(original);
 assert.equal(next.round,2);
 assert.equal(next.actors.PLAYER.equippedWeapon.durability,80);
 assert.equal(next.mana.PLAYER.current,15);
 assert.equal(next.actors.NPC.hp,100);
 assert.deepEqual(next.itemRepairsThisRound,[{
  by:"PLAYER",characterItemId:1610,restored:5,round:2,
 }]);
 assert.equal(next.log.filter(x=>x.kind==="WEAPON_REPAIR").length,1);
 assert.equal(original.actors.PLAYER.equippedWeapon.durability,75,
  "pure combat engine may not mutate its input");
 assert.equal(defaultAttackSource(next.actors.PLAYER),"MAIN_HAND");
});

test("self repair is neither triggered by inspecting equipment nor by revisiting the same round",()=>{
 const s=encounter();
 const before=structuredClone(s);
 assert.equal(s.actors.PLAYER.equippedWeapon.durability,75);
 assert.deepEqual(s,before);
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"PLAYER");
 const repaired=s.actors.PLAYER.equippedWeapon.durability;
 const mana=s.mana.PLAYER.current;
 applyWeaponSelfRepairAtRoundStart(s,"PLAYER");
 assert.equal(s.actors.PLAYER.equippedWeapon.durability,repaired);
 assert.equal(s.mana.PLAYER.current,mana);
 assert.equal(s.log.filter(x=>x.kind==="WEAPON_REPAIR").length,1);
});

test("a broken weapon can restore itself at the next authorized round",()=>{
 const s=encounter(weapon("Espada rota",0));
 assert.equal(defaultAttackSource(s.actors.PLAYER),"FIST_RIGHT");
 const r=nextRound(s);
 assert.equal(r.actors.PLAYER.equippedWeapon.durability,5);
 assert.equal(defaultAttackSource(r.actors.PLAYER),"MAIN_HAND");
 assert.equal(r.mana.PLAYER.current,15);
});

test("no mana, full durability and unequipped/dropped weapons do not restore or pay",()=>{
 const noMana=encounter();
 noMana.mana.PLAYER.current=4;
 const a=nextRound(noMana);
 assert.equal(a.actors.PLAYER.equippedWeapon.durability,75);
 assert.equal(a.mana.PLAYER.current,4);
 assert.equal(a.log.filter(x=>x.kind==="WEAPON_REPAIR").length,0);
 const full=encounter(weapon("Nueva",100));
 const b=nextRound(full);
 assert.equal(b.mana.PLAYER.current,20);
 assert.equal(b.itemRepairsThisRound?.length,0);
 const unarmed=encounter(undefined);
 unarmed.actors.PLAYER.equippedWeapon=undefined;
 const c=nextRound(unarmed);
 assert.equal(c.mana.PLAYER.current,20);
});

test("unsupported dynamic stats disable the bad item effect without freezing a combat",()=>{
 const rule=defaultWeaponAutoRepair();
 rule.module.steps[1]={kind:"READ_STAT",actor:"USER",stat:"ImaginaryStat",output:"repairAmount"};
 const s=encounter({...weapon("Descompuesta",65),autoRepair:rule});
 const r=nextRound(s);
 assert.equal(r.round,2);
 assert.equal(r.actors.PLAYER.equippedWeapon.durability,65);
 assert.equal(r.mana.PLAYER.current,20);
 assert.equal(r.actors.PLAYER.equippedWeapon.autoRepairDisabled,true);
 assert.equal(r.log.filter(x=>x.kind==="WEAPON_REPAIR_SKIP").length,1);
 const t=nextRound(r);
 assert.equal(t.round,3);
 assert.equal(t.log.filter(x=>x.kind==="WEAPON_REPAIR_SKIP").length,1,
  "a bad graph should be diagnosed once, not crash or spam every turn");
});

test("turn interval is based on real round transitions, not on requests or UI reads",()=>{
 const rule=defaultWeaponAutoRepair();rule.intervalTurns=2;
 const s=encounter({...weapon("Espada periódica",70),autoRepair:rule});
 const r2=nextRound(s);assert.equal(r2.actors.PLAYER.equippedWeapon.durability,75);
 const r3=nextRound(r2);assert.equal(r3.actors.PLAYER.equippedWeapon.durability,75);
 const r4=nextRound(r3);assert.equal(r4.actors.PLAYER.equippedWeapon.durability,80);
 assert.equal(r4.mana.PLAYER.current,10);
 for(const n of [0,1,3,5])assert.equal(shouldAutoRepairAtRound(n,2),false);
 for(const n of [2,4,6])assert.equal(shouldAutoRepairAtRound(n,2),true);
 assert.equal(shouldAutoRepairAtRound(2,0),false);
});

test("both main and offhand are independent, identified by exact inventory copies",()=>{
 const main=weapon("Principal",80,610),off=weapon("Secundaria",40,611);
 const s=encounter(main);
 s.actors.PLAYER.offhandWeapon=off;
 const r=nextRound(s);
 assert.equal(r.actors.PLAYER.equippedWeapon.durability,85);
 assert.equal(r.actors.PLAYER.offhandWeapon.durability,45);
 assert.equal(r.mana.PLAYER.current,10);
 assert.deepEqual(r.itemRepairsThisRound.map(x=>x.characterItemId),[1610,1611]);
});

test("staff UI and protected management APIs provide the same strict item contract",()=>{
 const page=source("app/management/items/page.tsx");
 const create=source("app/api/management/items/route.ts");
 const edit=source("app/api/management/items/[id]/route.ts");
 const duel=source("app/api/combat/duels/route.ts");
 const actions=source("app/api/combat/[id]/actions/route.ts");
 const engine=source("lib/combat/turn-engine.ts");
 assert.match(page,/Autorreparación de esta arma/);
 assert.match(page,/<MicroEffectBuilder value=\{autoRepair\.module\}/);
 assert.match(page,/Maná por activación/);
 assert.match(page,/Cada cuántos turnos/);
 assert.match(create,/compileWeaponAutoRepair\(effects,itemType\)/);
 assert.match(edit,/compileWeaponAutoRepair\(effects,itemType\)/);
 assert.match(create,/canManageItemOrigin/);
 assert.match(edit,/canManageItemOrigin/);
 assert.match(duel,/compileWeaponAutoRepair\(item.effects,String\(item.itemType\)\)/);
 assert.match(engine,/applyWeaponSelfRepairAtRoundStart\(state,side\)/);
 assert.match(actions,/LEAST\(durability,\$\{before\}\)-\$\{worn\}\+\$\{repaired\}/);
 assert.match(actions,/itemRepairsThisRound/);
 assert.match(actions,/AND quantity=1/);
});

test("store and character exports present item passive as mana and interval, not undefined points",()=>{
 const store=source("app/store/page.tsx");
 const character=source("app/characters/[id]/page.tsx");
 assert.match(store,/effect\.type==="auto_repair_durability"/);
 assert.match(store,/effect\.manaCost/);
 assert.match(store,/effect\.intervalTurns/);
 assert.match(character,/effect\.type === "auto_repair_durability"/);
 assert.match(character,/params\.manaCost/);
 assert.match(character,/params\.intervalTurns/);
});
