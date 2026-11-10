import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const management = readFileSync(new URL("../app/management/items/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/management/items/route.ts", import.meta.url), "utf8");
const image = readFileSync(new URL("../lib/items/property-image-upload.ts", import.meta.url), "utf8");

test("property photos are compressed below Vercel's 1 MB body limit before upload", () => {
  assert.match(image, /PROPERTY_IMAGE_UPLOAD_LIMIT = 850 \* 1024/);
  assert.match(image, /canvas\.toBlob\(resolve, "image\/webp", quality\)/);
  assert.match(management, /await preparePropertyImage\(imageFile\)/);
  assert.match(management, /fd\.set\("file",optimizedFile\)/);
});

test("failed uploads keep the newly-created item selected for retry", () => {
  assert.match(management, /if\(wasCreating && savedId\) setSelected\(savedId\)/);
  assert.ok(management.indexOf("setSelected(savedId);\n      if(imageFile") < management.indexOf("fetch(\"/api/management/items/image\""));
  assert.match(management, /role="alert"/);
});

test("management returns signed URLs for saved property images", () => {
  assert.match(api, /imageUrl: item\.itemType === "PROPERTY" \? await getItemImageUrl\(item\.imagePath\) : null/);
});
