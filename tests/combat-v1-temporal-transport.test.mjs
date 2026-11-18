import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectTimelineToV1,v1IntentToTimeline}
 from "../lib/combat/v1-temporal-client.ts";
import {parseExperimentalV2Command}
 from "../lib/combat/timeline-experiment.ts";

const src=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const status={
 tick:140,round:2,waitingFor:["PLAYER"],
 pa:{PLAYER:{used:4,limit:6},NPC:{used:5,limit:5}},
 running:[{owner:"NPC",kind:"BLOCK",startsAtTick:130,endsAtTick:150}],
};
const view=(viewerSide,pa=status.pa,waitingFor=status.waitingFor)=>({
 mode:"EXPERIMENTAL_V2",viewerSide,
 state:{status:"ACTIVE",actors:{PLAYER:{hp:80},NPC:{hp:55}}},
 timeline:{...status,pa,waitingFor},
});

test("temporal sessions render the original V1 encounter with no second V2 UI",()=>{
 const page=src("app/combat/[id]/page.tsx");
 assert.match(page,/<CombatEncounter id=\{id\} mode="TIMELINE"\/>/);
 assert.doesNotMatch(page,/import CombatV2Encounter/);
 const client=src("app/combat/[id]/CombatEncounter.tsx");
 assert.match(client,/projectTimelineToV1/);
 assert.match(client,/v1IntentToTimeline/);
 for(const feature of [
  "CombatCharacterHud","CombatDialog","CombatTopDownPlane",
  "CombatVerticalActionPlane","CombatEquipmentStatus","CombatSkillLoadout",
  "CombatMusicPlayer",
 ])assert.ok(client.includes(feature),feature);
 assert.match(client,/Preparar bloqueo o esquiva/);
});

test("V1 temporal view uses authoritative PA and only authorizes the authenticated fighter",()=>{
 const first=projectTimelineToV1(view("PLAYER"));
 assert.deepEqual(first.permissions,{PLAYER:true,NPC:false});
 assert.deepEqual(first.canMove,{PLAYER:true,NPC:false});
 assert.equal(first.timeline.pa.PLAYER.used,4);
 assert.equal(first.timeline.tick,140);
 const second=projectTimelineToV1(view("NPC"));
 assert.deepEqual(second.permissions,{PLAYER:false,NPC:true});
 assert.deepEqual(second.canMove,{PLAYER:false,NPC:false});
 const spectator=projectTimelineToV1(view("SPECTATOR"));
 assert.deepEqual(spectator.permissions,{PLAYER:false,NPC:false});
 assert.deepEqual(spectator.canMove,{PLAYER:false,NPC:false});
 const noPa=projectTimelineToV1(view("PLAYER",{
  ...status.pa,PLAYER:{used:6,limit:6},
 }));
 assert.equal(noPa.canMove.PLAYER,false,"active actions require PA; WAIT is still free");
 assert.ok(noPa.timeline.waitingFor.includes("PLAYER"));
});

test("V1 shield, dodge, magic field and waiting compile to clock declarations",()=>{
 assert.deepEqual(v1IntentToTimeline({kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"}),
   {kind:"GUARD",weaponSlot:"OFF_HAND"});
 assert.deepEqual(v1IntentToTimeline({kind:"DEFEND",defense:"DODGE",
   predictedCenter:{x:.4,y:.5},dodgeDirection:"AWAY"}),
   {kind:"PREPARE_REACTION",defense:"DODGE",
     predictedCenter:{x:.4,y:.5},dodgeDirection:"AWAY"});
 assert.deepEqual(v1IntentToTimeline({kind:"DEFEND",defense:"MAGIC_FIELD"}),
   {kind:"PREPARE_REACTION",defense:"MAGIC_FIELD"});
 assert.deepEqual(v1IntentToTimeline({kind:"DEFEND",defense:"NONE"}),
   {kind:"WAIT"});
 assert.throws(()=>v1IntentToTimeline({kind:"DEFEND",defense:"BLOCK"}),/escudo/);
 assert.throws(()=>v1IntentToTimeline({kind:"DEFEND",defense:"DODGE"}),/predicción/);
 assert.throws(()=>v1IntentToTimeline({kind:"DEFEND",defense:"CONSTRUCTION"}),
   /no tiene una declaración/);
});

test("V1 manual planar movement is accepted by the clock parser with original geometry",()=>{
 const command={kind:"MOVE",direction:"VECTOR",meters:.5,
   planarMove:{x:.3,y:.4},requestId:"stable-v1-request-101"};
 const adapted=v1IntentToTimeline(command);
 assert.equal(adapted.requestId,undefined);
 assert.equal(adapted.planarMove.x,.3);
 assert.deepEqual(parseExperimentalV2Command(adapted),adapted);
 assert.throws(()=>parseExperimentalV2Command({...adapted,meters:.1}),
   /Orden no disponible/);
 assert.throws(()=>parseExperimentalV2Command({...adapted,planarMove:{x:9,y:0}}),
   /Orden no disponible/);
});

test("V1 full precision trajectories survive the clock parser, no invented 16-point ceiling",()=>{
 const trajectory=Array.from({length:80},(_,i)=>({x:i/79,y:.5}));
 const input=v1IntentToTimeline({kind:"ATTACK",attackType:"CUT",
   attackSource:"FIST_RIGHT",trajectory,requestId:"stable-v1-attack-123"});
 assert.equal(input.requestId,undefined);
 assert.equal(parseExperimentalV2Command(input).trajectory.length,80);
 assert.throws(()=>parseExperimentalV2Command({...input,
   trajectory:[...trajectory,{x:1,y:1}]}),/Orden no disponible/);
});

test("unsupported physical-world commands fail explicitly, never disappear silently",()=>{
 assert.throws(()=>v1IntentToTimeline({kind:"BOOST_KARMA",requestId:"stable-karma-123",
   allocation:{strength:1}}),/autorización/);
 assert.throws(()=>v1IntentToTimeline({kind:"DEFEND",defense:"DODGE",
   predictedCenter:{x:.5,y:.5},dodgeDirection:"WEAPON"}),/trayectoria temporal/);
 assert.deepEqual(v1IntentToTimeline({kind:"WAIT",requestId:"stable-wait-123"}),
   {kind:"WAIT"});
});
