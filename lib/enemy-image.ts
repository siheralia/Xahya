const BUCKET = "enemy-images";

function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

export async function getEnemyImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { url, key } = config();
  const signed = await fetch(url + "/storage/v1/object/sign/" + BUCKET + "/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });
  if (!signed.ok) return null;
  const data = await signed.json();
  return data.signedURL ? url + "/storage/v1" + data.signedURL : null;
}

export async function uploadEnemyImage(path: string, file: File) {
  const { url, key } = config();
  const upload = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      apikey: key,
      "Content-Type": "image/webp",
      "x-upsert": "true",
      "cache-control": "31536000",
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store",
  });
  if (!upload.ok) throw new Error("No se pudo guardar la imagen en Storage.");
}

export async function deleteEnemyImage(path: string | null | undefined) {
  if (!path) return;
  const { url, key } = config();
  await fetch(url + "/storage/v1/object/" + BUCKET, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });
}
