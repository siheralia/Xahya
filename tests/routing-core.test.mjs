import test from "node:test";
import assert from "node:assert/strict";
import {buildRoutes,geometricSeriesOffset} from "../lib/elements/routing/routingCore.mjs";
const nodes=[{id:"a",x:100,y:600,radius:25,color:"#fff"},{id:"b",x:700,y:100,radius:25,color:"#000"},{id:"c",x:600,y:650,radius:25,color:"#f00"}];
const edges=[{id:"1",from:"a",to:"b",kind:"advantage"},{id:"2",from:"b",to:"a",kind:"progenitor"},{id:"3",from:"a",to:"b",kind:"cooperation"}];
test("geometric lanes",()=>{assert.equal(geometricSeriesOffset(100,0),50);assert.equal(geometricSeriesOffset(100,1),75);assert.equal(geometricSeriesOffset(100,2),87.5)});
for(const strategy of ["ordered","elastic","adaptive"])test(strategy,()=>{const r=buildRoutes({nodes,edges,strategy});assert.equal(r.routes.length,3);assert.equal(r.strategy,strategy);for(const e of r.routes){assert.ok(Number.isFinite(e.control.x));assert.ok(e.path.startsWith("M"));const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);assert.ok(Math.abs(Math.hypot(e.start.x-a.x,e.start.y-a.y)-25)<1e-6);assert.ok(Math.abs(Math.hypot(e.end.x-b.x,e.end.y-b.y)-25)<1e-6)}assert.deepEqual(r,buildRoutes({nodes,edges,strategy}))});
test("unknown endpoints ignored",()=>assert.equal(buildRoutes({nodes,edges:[...edges,{id:"x",from:"a",to:"missing"}]}).routes.length,3));
