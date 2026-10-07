const BUCKET = "race-images";

function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

function headers(key: string, json = false): Record<string, string> {
  return {
    Authorization: "Bearer " + key,
    apikey: key,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function getRaceImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { url, key } = config();
  const response = await fetch(
    url + "/storage/v1/object/sign/" + BUCKET + "/" + path,
    {
      method: "POST",
      headers: headers(key, true),
      body: JSON.stringify({ expiresIn: 3600 }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.signedURL ? url + "/storage/v1" + data.signedURL : null;
}

export async function uploadRaceImage(path: string, file: File) {
  const { url, key } = config();
  const response = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: {
      ...headers(key),
      "Content-Type": "image/webp",
      "x-upsert": "true",
      "cache-control": "31536000",
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Supabase Storage rechazó la imagen (" + response.status + ").");
  }
}

export async function deleteRaceImage(path: string | null | undefined) {
  if (!path) return;
  const { url, key } = config();
  await fetch(url + "/storage/v1/object/" + BUCKET, {
    method: "DELETE",
    headers: headers(key, true),
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });
}
