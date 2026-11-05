import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCatalogResponse} from "../lib/items/catalog-response.ts";

const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("material catalog accepts valid JSON with existing records",async()=>{
 const payload={materials:[{id:1,name:"Hierro"}],types:[{code:"METAL",name:"Metal"}],perks:[],capabilities:{create:true,edit:true,delete:true}};
 const value=await parseCatalogResponse(new Response(JSON.stringify(payload),{
  status:200,headers:{"Content-Type":"application/json"}}),"los materiales");
 assert.deepEqual(value,payload);
});

test("empty 500 response produces an HTTP error instead of unexpected end of JSON",async()=>{
 await assert.rejects(
  parseCatalogResponse(new Response("",{status:500}),"los materiales"),
  /No se pudieron cargar los materiales \(error HTTP 500\)/);
});

test("HTML 502 response produces a clear error and never leaks raw HTML",async()=>{
 await assert.rejects(
  parseCatalogResponse(new Response("<html>Bad gateway</html>",{status:502,headers:{"Content-Type":"text/html"}}),"los tipos de material"),
  /error HTTP 502/);
});

test("API JSON errors and permission denials preserve meaningful localized messages",async()=>{
 await assert.rejects(
  parseCatalogResponse(new Response(JSON.stringify({error:"Sin permiso para consultar tipos."}),{
   status:403,headers:{"Content-Type":"application/json"}}),"los tipos de material"),
  /Sin permiso para consultar tipos/);
 await assert.rejects(
  parseCatalogResponse(new Response("",{status:403}),"los materiales"),
  /no tiene permiso/);
});

test("successful but empty or malformed JSON cannot become a false empty catalog",async()=>{
 await assert.rejects(parseCatalogResponse(new Response("",{status:200}),"los materiales"),
  /no devolvió los datos/);
 await assert.rejects(parseCatalogResponse(new Response("not json",{status:200}),"los materiales"),
  /respuesta no válida/);
 await assert.rejects(parseCatalogResponse(new Response("[]",{status:200}),"los materiales"),
  /no devolvió los datos/);
});

test("migration repairs all eight unquoted materialType columns without destroying rows",()=>{
 const migration=load("supabase/migrations/20261105192758_repair_material_type_camelcase_identifiers.sql");
 for(const column of ["naturalForm","minimumForm","rawForm","marketForm",
   "fireReaction","lightningReaction","iceReaction","createdAt"]){
  assert.ok(migration.includes("'"+column+"'"),"column "+column);
 }
 assert.match(migration,/RENAME COLUMN %I TO %I/);
 assert.match(migration,/information_schema\.columns/);
 assert.doesNotMatch(migration,/\bDROP\s+TABLE\b/i);
 assert.doesNotMatch(migration,/\bTRUNCATE\b/i);
 const contract=load("prisma/contract.prisma");
 assert.match(contract,/model MaterialType \{/);
 assert.match(contract,/fireReaction\s+String\?/);
 assert.match(contract,/createdAt\s+DateTime/);
});

test("both material management APIs return JSON error bodies for unexpected server errors",()=>{
 for(const path of ["app/api/management/materials/route.ts","app/api/management/material-types/route.ts"]){
  const api=load(path);
  assert.match(api,/export async function GET\(\)/);
  assert.match(api,/catch\(error\)/);
  assert.match(api,/console\.error/);
  assert.match(api,/status:500/);
  assert.match(api,/Cache-Control/);
 }
 for(const path of ["app/management/materials/page.tsx","app/management/material-types/page.tsx"]){
  const page=load(path);
  assert.match(page,/parseCatalogResponse/);
  assert.match(page,/loadFailed/);
  assert.match(page,/Volver a intentar/);
  assert.doesNotMatch(page,/const data=await response\.json\(\)/);
 }
});
