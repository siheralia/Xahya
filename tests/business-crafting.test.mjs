import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MANAGED_CRAFT_RECIPES_KEY,normalizeManagedCraftRecipe,readManagedCraftRecipes,
 authorizedCraftRecipes,checkManagedCraftLimits,allocateCraftMaterials,
 validateCraftOutput
} from "../lib/managed-crafting.ts";

const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const recipe=(overrides={})=>({
 id:"ForgeSword0001",name:"Forja de espada",description:"Arma normal del catálogo.",
 active:true,kind:"FORGE",fee:25,outputItemId:500,outputQuantity:1,
 ingredients:[{itemId:11,quantity:3},{itemId:12,quantity:2}],
 customerAccess:"PUBLIC",requiresEmployee:true,businessIds:[9,3],
 ...overrides
});
test("admin recipe normalizes business whitelist and exact allowed fields",()=>{
 const r=normalizeManagedCraftRecipe(recipe());
 assert.equal(MANAGED_CRAFT_RECIPES_KEY,"managed_craft_recipes_v1");
 assert.deepEqual(r.businessIds,[3,9]);
 assert.deepEqual(r.ingredients,[{itemId:11,quantity:3},{itemId:12,quantity:2}]);
 for(const extra of [
  {fee:-1},{fee:1.5},{fee:1000001},{outputQuantity:0},{outputQuantity:11},
  {outputItemId:0},{kind:"POTION"},{active:"false"},{customerAccess:"STAFF"},
  {requiresEmployee:1},{name:""},{fakeDamage:9999},{ingredients:[]},
  {ingredients:[{itemId:11,quantity:1},{itemId:11,quantity:2}]},
  {ingredients:[{itemId:11,quantity:0}]},
  {ingredients:[{itemId:11,quantity:101}]},
  {ingredients:[{itemId:11,quantity:1,grantPower:1000}]},
  {businessIds:[1,1]},{businessIds:["3"]},{businessIds:[0]},
 ])assert.throws(()=>normalizeManagedCraftRecipe(recipe(extra)),undefined,JSON.stringify(extra));
});
test("empty, malformed or duplicate catalog values never become executable",()=>{
 const valid=normalizeManagedCraftRecipe(recipe());
 const second=normalizeManagedCraftRecipe(recipe({id:"ForgeSword0002",businessIds:[9]}));
 assert.deepEqual(readManagedCraftRecipes(JSON.stringify([
  valid,{...valid,fee:-5},valid,second
 ])),[valid,second]);
 assert.deepEqual(readManagedCraftRecipes("{bad"),[]);
 assert.deepEqual(readManagedCraftRecipes(null),[]);
 assert.deepEqual(authorizedCraftRecipes([valid,second],3).map(x=>x.id),[valid.id]);
 assert.deepEqual(authorizedCraftRecipes([valid,second],9).map(x=>x.id),
  [valid.id,second.id]);
 assert.deepEqual(authorizedCraftRecipes([valid,second],19),[]);
 assert.deepEqual(authorizedCraftRecipes([valid,{...second,active:false}],9)
  .map(x=>x.id),[valid.id]);
 assert.deepEqual(authorizedCraftRecipes([valid,{...second,active:false}],9,true)
  .map(x=>x.id),[valid.id,second.id]);
});
test("maximum twelve recipes for one shop, max 100 globally and no duplicates",()=>{
 const recipes=Array.from({length:13},(_,i)=>normalizeManagedCraftRecipe(
  recipe({id:"CraftLimit"+String(i).padStart(8,"0"),businessIds:[9]})
 ));
 assert.throws(()=>checkManagedCraftLimits(recipes),/Máximo 12/);
 checkManagedCraftLimits(recipes.slice(0,12));
 assert.throws(()=>checkManagedCraftLimits([recipes[0],recipes[0]]),/duplicadas/);
 const distributed=Array.from({length:101},(_,i)=>normalizeManagedCraftRecipe(
  recipe({id:"CraftTotal"+String(i).padStart(8,"0"),businessIds:[]})
 ));
 assert.throws(()=>checkManagedCraftLimits(distributed),/Máximo 100/);
});
test("forged equipment or non-equipment fabrication only produces predefined CRAFTED items",()=>{
 const forge=normalizeManagedCraftRecipe(recipe());
 const item={id:500,itemType:"WEAPON",acquisitionType:"CRAFTED",propertyBusinessId:null};
 assert.doesNotThrow(()=>validateCraftOutput(forge,item));
 for(const change of [
  {id:501},{itemType:"PROPERTY"},{itemType:"CONSUMABLE"},
  {acquisitionType:"SYSTEM"},{acquisitionType:"PURCHASABLE"},
  {propertyBusinessId:5}
 ])assert.throws(()=>validateCraftOutput(forge,{...item,...change}));
 const fabrication=normalizeManagedCraftRecipe(recipe({kind:"FABRICATE"}));
 for(const kind of ["MATERIAL","CONSUMABLE","OTHER","ARMOR","ACCESSORY"]){
  assert.doesNotThrow(()=>validateCraftOutput(fabrication,{...item,itemType:kind}));
 }
 assert.throws(()=>validateCraftOutput(fabrication,{...item,itemType:"PROPERTY"}));
});
test("multiple materials consume only available unequipped stacks deterministically",()=>{
 const r=normalizeManagedCraftRecipe(recipe());
 const stacks=[
  {id:20,itemId:11,quantity:2,equipped:false},
  {id:3,itemId:11,quantity:2,equipped:false},
  {id:4,itemId:11,quantity:10,equipped:true},
  {id:30,itemId:12,quantity:1,equipped:false},
  {id:31,itemId:12,quantity:3,equipped:false},
  {id:7,itemId:100,quantity:999,equipped:false},
 ];
 assert.deepEqual(allocateCraftMaterials(r.ingredients,stacks),[
  {characterItemId:3,itemId:11,quantity:2},
  {characterItemId:20,itemId:11,quantity:1},
  {characterItemId:30,itemId:12,quantity:1},
  {characterItemId:31,itemId:12,quantity:1}
 ]);
 assert.throws(()=>allocateCraftMaterials([{itemId:11,quantity:5}],stacks),/materiales/);
 assert.throws(()=>allocateCraftMaterials([{itemId:12,quantity:5}],stacks),/materiales/);
});
test("management endpoint is admin-only and validates real output, material and shops",()=>{
 const code=src("app/api/management/businesses/crafting/route.ts");
 assert.match(code,/String\(user.role\)==="ADMIN"/);
 assert.match(code,/normalizeManagedCraftRecipe/);
 assert.match(code,/validateCraftOutput/);
 assert.match(code,/String\(item.itemType\)!=="MATERIAL"/);
 assert.match(code,/checkManagedCraftLimits/);
 assert.match(code,/MANAGED_CRAFT_RECIPES_KEY/);
 assert.match(code,/AuditLog.create/);
 assert.match(code,/UPDATE public."appSetting" SET id=id/);
});
test("real manufacturing transaction debits materials and money before granting catalog copies",()=>{
 const route=src("app/api/businesses/crafting/route.ts");
 assert.match(route,/await db.transaction\(async tx=>/);
 assert.match(route,/UPDATE public."character" SET id=id/);
 assert.match(route,/Number\(current.userId\)!==Number\(user.id\)/);
 assert.match(route,/UPDATE public."business" SET id=id/);
 assert.match(route,/UPDATE public."appSetting" SET id=id/);
 assert.match(route,/authorizedCraftRecipes/);
 assert.match(route,/validateCraftOutput/);
 assert.match(route,/MATERIAL_INVALID/);
 assert.match(route,/UPDATE public."characterResource" SET id=id/);
 assert.match(route,/allocateCraftMaterials/);
 assert.match(route,/AND equipped=false AND quantity>=/);
 assert.match(route,/await CI.where\(\{id:part.characterItemId,characterId,quantity:0\}\).delete\(\)/);
 assert.match(route,/money:money-recipe.fee/);
 assert.match(route,/balance:Number\(business.balance\)\+recipe.fee/);
 assert.match(route,/const individual=\["WEAPON","ARMOR","ACCESSORY"\]/);
 assert.match(route,/await CI.create\(/);
 assert.match(route,/durability:100/);
 const charge=route.indexOf("UPDATE public.\"characterItem\" SET quantity=quantity-");
 const credit=route.indexOf("const createdIds:number[]");
 const audit=route.lastIndexOf('action:"BUSINESS_ITEM_CRAFT"');
 assert.ok(charge>=0&&credit>charge&&audit>credit);
});
test("idempotency, PvP lock and employee/customer restrictions are server-side",()=>{
 const route=src("app/api/businesses/crafting/route.ts");
 const replay=route.indexOf('data?.requestId!==requestId');
 const debit=route.indexOf('UPDATE public."characterItem" SET quantity=quantity-');
 assert.ok(replay>0&&debit>replay,"replay check before any debit");
 assert.match(route,/data\?\.businessId!==businessId\|\|data\?\.recipeId!==recipeId/);
 assert.match(route,/return \{\.\.\.data.result,replayed:true\}/);
 assert.match(route,/WHERE status='ACTIVE'/);
 assert.match(route,/opponentCharacterId/);
 assert.match(route,/customerAccess==="OWNER_ONLY"/);
 assert.match(route,/EmploymentContract/);
 assert.match(route,/recipe.requiresEmployee/);
 assert.match(route,/if\(\(await tx.execute\(lockCatalog\)\).affectedRows!==1\)/);
});
test("owners can only see offers, while customers can craft and management can edit",()=>{
 const manager=src("app/management/businesses/crafting/page.tsx");
 const owner=src("components/businesses/CraftingServicesPanel.tsx");
 const ownerPage=src("app/businesses/page.tsx");
 const customer=src("app/businesses/crafting/page.tsx");
 const catalog=src("app/businesses/catalog/page.tsx");
 const navigation=src("app/management/_components/ManagementNavigation.tsx");
 assert.match(manager,/Guardar receta y autorizaciones/);
 assert.match(manager,/businessIds/);
 assert.match(manager,/api\/management\/businesses\/crafting/);
 assert.match(owner, /Forja y fabricación autorizadas/);
 assert.doesNotMatch(owner,/method:"POST"|<MicroEffectBuilder/);
 assert.match(ownerPage,/<CraftingServicesPanel businessId=\{business.id\}/);
 assert.match(customer,/api\/businesses\/crafting/);
 assert.match(customer,/requestId:"Craft"\+crypto.randomUUID/);
 assert.match(catalog,/href="\/businesses\/crafting"/);
 assert.match(navigation,/href: "\/management\/businesses\/crafting".*adminOnly: true/);
});
