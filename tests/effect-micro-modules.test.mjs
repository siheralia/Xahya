import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyMicroState,executeMicroEvent,parseMicroState,validateEffectContainers,chargeCount,totalStored} from '../lib/effects/micro-modules.ts';
const ref=(source,key)=>({source,key});
const op=(operator,...args)=>({operator,args});
const rule=(left,compare,right)=>[{left,compare,right}];
const store='DIVINE_GRACE';
const grace={id:'grace',name:'Gracia divina',type:'PASSIVE',description:'Almacena el daño mitigado',trigger:'DAMAGE_RESOLVED',steps:[{kind:'STORE',accumulator:store,capacity:5,value:ref('EVENT','MITIGATED_DAMAGE')}]};
const sanctuaryDefense={id:'sanctuary-defense',name:'Santuario Interior',type:'PASSIVE',description:'Resistencia si no hay cargas',trigger:'PASSIVE',steps:[{kind:'MODIFIER',stat:'RESISTANCE',multiplier:1.3,when:rule(ref('CHARGES',store),'EQ',0)}]};
const sanctuaryHeal={id:'sanctuary-heal',name:'Santuario Interior',type:'PASSIVE',description:'Curación por turno al tener cargas',trigger:'TURN_START',steps:[{kind:'HEAL',amount:op('PERCENT',ref('STAT','MAX_HP'),10),when:rule(ref('CHARGES',store),'GTE',1)}]};
const retributionDirect={id:'retribution-direct',name:'Retribución divina',type:'ATTACK',description:'Golpe físico con inyección de luz',trigger:'IMPACT',impactKind:'CHARACTER',requirements:rule(ref('CHARGES',store),'GTE',1),steps:[
 {kind:'CONSUME',accumulator:store,output:'energy',charges:'ALL'},
 {kind:'DAMAGE',channel:'PHYSICAL',amount:op('ADD',100,ref('STAT','STR'))},
 {kind:'DAMAGE',channel:'MAGICAL',element:'LIGHT',amount:ref('OUTPUT','energy')}
]};
const retributionGround={id:'retribution-ground',name:'Retribución divina',type:'ATTACK',description:'Terremoto de luz',trigger:'IMPACT',impactKind:'GROUND',requirements:rule(ref('CHARGES',store),'GTE',1),steps:[
 {kind:'CONSUME',accumulator:store,output:'energy',charges:'ALL'},
 {kind:'DAMAGE',channel:'MAGICAL',element:'LIGHT',amount:ref('OUTPUT','energy'),radiusMeters:op('ADD',3,op('DIVIDE',ref('STAT','STR'),20))}
]};
const effects=[grace,sanctuaryDefense,sanctuaryHeal,retributionDirect,retributionGround];
const ctx=(eventId,trigger,more={})=>({eventId,trigger,ownerId:7,stats:{HP:40,MAX_HP:100,STR:40},...more});
test('validate complete real-world Gloria composed effects',()=>assert.equal(validateEffectContainers(effects),null));
test('empty Gracia gives 30% resistance; after taking mitigated damage switches to 10% healing',()=>{
 let s=emptyMicroState();
 assert.deepEqual(executeMicroEvent(s,effects,ctx('passive1','PASSIVE')).intents,[{kind:'MODIFIER',stat:'RESISTANCE',multiplier:1.3}]);
 const hit=executeMicroEvent(s,effects,ctx('hit1','DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:12}}));s=hit.state;
 assert.equal(chargeCount(s,7,store),1);assert.equal(totalStored(s,7,store),12);
 assert.deepEqual(executeMicroEvent(s,effects,ctx('passive2','PASSIVE')).intents,[]);
 const healed=executeMicroEvent(s,effects,ctx('turn1','TURN_START'));
 assert.deepEqual(healed.intents,[{kind:'HEAL',requested:10,applied:10}]);assert.equal(healed.hp,50);
});
test('stores 5 independent charges, drops excess, and heals with cap',()=>{
 let s=emptyMicroState();
 for(let i=0;i<7;i++)s=executeMicroEvent(s,effects,ctx('hit'+i,'DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:i+1}})).state;
 assert.equal(chargeCount(s,7,store),5);assert.equal(totalStored(s,7,store),15);
 const heal=executeMicroEvent(s,effects,ctx('turnA','TURN_START',{stats:{HP:98,MAX_HP:100,STR:40}}));
 assert.equal(heal.hp,100);assert.equal(heal.intents[0].applied,2);
});
test('direct retribution consumes all once, emits separate physical and light magical attacks',()=>{
 let s=emptyMicroState();
 for(const [i,amount] of [12,8,20,15,10].entries())s=executeMicroEvent(s,effects,ctx('hit'+i,'DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:amount}})).state;
 const out=executeMicroEvent(s,effects,ctx('cast-impact','IMPACT',{impactKind:'CHARACTER'}));
 assert.equal(totalStored(out.state,7,store),0);
 assert.deepEqual(out.intents,[{kind:'DAMAGE',amount:140,channel:'PHYSICAL',element:undefined,radiusMeters:undefined},{kind:'DAMAGE',amount:65,channel:'MAGICAL',element:'LIGHT',radiusMeters:undefined}]);
 assert.equal(executeMicroEvent(out.state,effects,ctx('after','PASSIVE')).intents[0].multiplier,1.3);
 assert.equal(executeMicroEvent(out.state,effects,ctx('cast-impact','IMPACT',{impactKind:'CHARACTER'})).skipped,true);
});
test('ground impact uses stored damage as light area attack with strength radius',()=>{
 const filled=executeMicroEvent(emptyMicroState(),effects,ctx('hit1','DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:80}}));
 const out=executeMicroEvent(filled.state,effects,ctx('impact','IMPACT',{impactKind:'GROUND'}));
 assert.deepEqual(out.intents,[{kind:'DAMAGE',amount:80,channel:'MAGICAL',element:'LIGHT',radiusMeters:5}]);
});
test('owner namespace prevents cross-character charge access',()=>{
 const s=executeMicroEvent(emptyMicroState(),effects,ctx('hit','DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:60}})).state;
 assert.equal(chargeCount(s,8,store),0);
 assert.deepEqual(executeMicroEvent(s,effects,ctx('passive','PASSIVE',{ownerId:8})).intents,[{kind:'MODIFIER',stat:'RESISTANCE',multiplier:1.3}]);
});
test('invalid config, invalid numbers and references fail rather than mutate state',()=>{
 assert.match(validateEffectContainers([{...grace,steps:[{kind:'STORE',accumulator:store,capacity:0,value:1}]}]),/capacidad|almacenamiento/);
 const s=emptyMicroState();
 assert.throws(()=>executeMicroEvent(s,effects,ctx('hit','DAMAGE_RESOLVED',{event:{}})),/referencia no disponible/);
 assert.deepEqual(s,emptyMicroState());
 assert.deepEqual(parseMicroState({accumulators:{'7:DIVINE_GRACE':{capacity:2,charges:[5,Infinity]}},processed:['ok']}),{accumulators:{},processed:['ok']});
});
test('retribution requires at least one charge',()=>{
 const out=executeMicroEvent(emptyMicroState(),effects,ctx('empty-impact','IMPACT',{impactKind:'CHARACTER'}));
 assert.deepEqual(out.intents,[]);
});
test('zero mitigated damage does not produce a charge',()=>{
 const out=executeMicroEvent(emptyMicroState(),effects,ctx('hit','DAMAGE_RESOLVED',{event:{MITIGATED_DAMAGE:0}}));
 assert.equal(chargeCount(out.state,7,store),0);
});
