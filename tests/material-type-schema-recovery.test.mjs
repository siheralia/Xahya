import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readMaterialApiResponse} from "../lib/items/material-api-response.ts";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("materialType migration repairs all unquoted camelCase names to the ORM contract",()=>{
 const sql=read("supabase/migrations/20261105192758_repair_material_type_camelcase_identifiers.sql");
 const schema=read("prisma/contract.prisma");
 const expected=["naturalForm","minimumForm","rawForm","marketForm",
  "fireReaction","lightningReaction","iceReaction"];
 for(const name of expected){
  assert.match(sql,new RegExp('RENAME COLUMN '+name.toLowerCase()+' TO "'+name+'"'));
  assert.match(schema,new RegExp('\\b'+name+'\\s+String\\?'));
 }
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|TRUNCATE|DROP COLUMN/);
});

test("a broken server response does not display raw JSON parser errors",async()=>{
 const response=new Response("<!DOCTYPE html>Server Error",{status:500,headers:{"content-type":"text/html"}});
 await assert.rejects(readMaterialApiResponse(response),err=>{
  assert.match(err.message,/servidor/i);
  assert.match(err.message,/HTTP 500/);
  assert.doesNotMatch(err.message,/Unexpected end/);
  return true;
 });
});

test("structured server errors and auth errors provide a clear message",async()=>{
 const backend=new Response(JSON.stringify({error:"No se pudo consultar los materiales."}),
  {status:503,headers:{"content-type":"application/json"}});
 await assert.rejects(readMaterialApiResponse(backend),/No se pudo consultar los materiales\. \(HTTP 503\)/);
 const denied=new Response("",{status:403});
 await assert.rejects(readMaterialApiResponse(denied),/sesión o los permisos.*HTTP 403/);
});

test("HTTP success with an empty or malformed body is never interpreted as 0 materials",async()=>{
 await assert.rejects(readMaterialApiResponse(new Response("",{status:200})),/respuesta vacía/);
 await assert.rejects(readMaterialApiResponse(new Response("not json",{status:200})),/respuesta vacía/);
 const expected={materials:[{id:1,name:"Acero"}],types:[{code:"METAL",name:"Metal"}]};
 assert.deepEqual(await readMaterialApiResponse(new Response(JSON.stringify(expected),{status:200})),expected);
});

test("material endpoints return safe JSON on failure and management UI offers retry",()=>{
 for(const kind of ["materials","material-types"]){
  const api=read("app/api/management/"+kind+"/route.ts");
  const ui=read("app/management/"+kind+"/page.tsx");
  assert.match(api,/catch\(error\)/);
  assert.match(api,/status:503/);
  assert.match(api,/NextResponse\.json\(\{error:/);
  assert.match(ui,/readMaterialApiResponse/);
  assert.match(ui,/Reintentar consulta/);
  assert.match(ui,/error\?null:/);
 }
});
