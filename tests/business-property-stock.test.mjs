import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const property=source("app/api/businesses/property/route.ts");
const businesses=source("app/api/businesses/route.ts");
const page=source("app/businesses/page.tsx");

test("property buying uses the database default timestamp rather than an explicit JS Date",()=>{
  assert.match(property,/const property=await CP\.create\(\{characterId,itemId:Number\(item.id\),businessId:Number\(business.id\),purchasePrice:price\}\)/);
  assert.doesNotMatch(property,/createdAt:new Date\(\)/);
  assert.match(property,/Number\.isSafeInteger\(price\)/);
  assert.match(property,/BUSINESS_PROPERTY_PURCHASE_FAILED/);
  assert.match(property,/await db\.transaction\(/);
});

test("an owner may reduce only their own existing stock, never mint new inventory",()=>{
  assert.match(businesses,/"reduceStock"/);
  assert.match(businesses,/const owned = await getOwnedBusiness\(user, businessId\)/);
  assert.match(businesses,/!Number\.isSafeInteger\(newStock\)\|\|newStock<0/);
  assert.match(businesses,/P\.where\(\{id:productId,businessId\}\)\.first\(\)/);
  assert.match(businesses,/newStock>Number\(product.stock\)/);
  assert.match(businesses,/P\.where\(\{id:productId,businessId\}\)\.update\(\{stock:newStock\}\)/);
  assert.match(businesses,/db\.raw\.sql/);
  assert.match(businesses,/tx\.execute\(lock\)/);
  assert.doesNotMatch(businesses,/executeRaw/);
  assert.match(businesses,/UPDATE public\."businessProduct" SET id=id WHERE id=/);
});

test("business UI shows current stock, allows one or zero, and rejects increases",()=>{
  assert.match(page,/Ajustar existencias/);
  assert.match(page,/stock>=0&&stock<=product.stock/);
  assert.match(page,/step=\{1\}/);
  assert.match(page,/await submit\("reduceStock",\{businessId,productId:product.id,stock\}\)/);
  assert.match(page,/stock===product.stock/);
});
