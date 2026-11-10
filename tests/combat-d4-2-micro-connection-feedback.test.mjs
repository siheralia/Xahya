import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {explainMicroConnection} from "../lib/effects/micro-connection-feedback.ts";

const base={
 readOnly:false,sourceIndex:0,sourceOutput:"objectResult",sourceKind:"ITEM",
 targetIndex:1,targetPorts:[{id:"target",label:"Objeto",kind:"ITEM"}],portId:"target",
};

test("D4.2: compatible forward connection has no extra privileges or reason",()=>{
 assert.equal(explainMicroConnection(base),null);
 assert.match(explainMicroConnection({...base,readOnly:true}),/solo lectura/);
});

test("D4.2: wrong order and self-links are rejected with Spanish reasons",()=>{
 assert.match(explainMicroConnection({...base,targetIndex:0}),/después del origen/);
 assert.match(explainMicroConnection({...base,targetIndex:-1}),/Selecciona un módulo/);
 assert.match(explainMicroConnection({...base,sourceIndex:-1}),/Selecciona primero/);
});

test("D4.2: invalid types and disconnected ports explain the necessary input kind",()=>{
 const numberPort={...base,targetPorts:[{id:"amount",label:"Cantidad",kind:"NUMBER"}],portId:"amount"};
 assert.match(explainMicroConnection(numberPort),/necesita un valor numérico/);
 assert.match(explainMicroConnection(numberPort),/entrega un objeto/);
 const statPort={...base,targetPorts:[{id:"stat",label:"Estadística",kind:"STAT"}],portId:"stat"};
 assert.match(explainMicroConnection(statPort),/una estadística/);
 assert.match(explainMicroConnection({...base,portId:"invalid"}),/entrada disponible/);
});

test("D4.2: missing outputs cannot be treated as connectable",()=>{
 assert.match(explainMicroConnection({...base,sourceOutput:""}),/no produce una salida/);
 assert.match(explainMicroConnection({...base,sourceKind:null}),/No se conoce el tipo/);
});

test("D4.2: React Flow and mobile assist both use identical validation",()=>{
 const file=readFileSync(new URL("../components/effects/MicroEffectFlowEditor.tsx",import.meta.url),"utf8");
 assert.match(file,/const describeConnection=useCallback/);
 assert.match(file,/return explainMicroConnection\(/);
 assert.match(file,/const validLink=useCallback/);
 assert.match(file,/describeConnection\(indexOfNode\(link\.source\)/);
 assert.match(file,/onConnectEnd=\{/);
 assert.match(file,/Conectar módulos sin arrastrar \(móvil y teclado\)/);
 assert.match(file,/onClick=\{addChosenConnection\}/);
 assert.match(file,/value=\{selectedPort\}/);
 assert.match(file,/aria-live="polite"/);
 assert.match(file,/El servidor valida todas las referencias y el PCH antes de aprobar/);
});
