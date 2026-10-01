const BUCKET = "enemy-images";

function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

function headers(key:string, json=false):Record<string,string>{
  return { Authorization:"Bearer "+key, apikey:key, ...(json?{"Content-Type":"application/json"}:{}) };
}

export async function getEnemyImageUrl(path:string|null|undefined) {
  if (!path) return null;
  const {url,key}=config();
  const r=await fetch(url+"/storage/v1/object/sign/"+BUCKET+"/"+path,{method:"POST",headers:headers(key,true),body:JSON.stringify({expiresIn:3600}),cache:"no-store"});
  if(!r.ok)return null;
  const d=await r.json();
  return d.signedURL ? url+"/storage/v1"+d.signedURL : null;
}

export async function uploadEnemyImage(path:string,file:File){
  const {url,key}=config();
  const r=await fetch(url+"/storage/v1/object/"+BUCKET+"/"+path,{method:"POST",headers:{...headers(key),"Content-Type":"image/webp","x-upsert":"true","cache-control":"31536000"},body:Buffer.from(await file.arrayBuffer()),cache:"no-store"});
  if(!r.ok)throw new Error("Supabase Storage rechazó la imagen ("+r.status+").");
}

export async function deleteEnemyImage(path:string|null|undefined){
  if(!path)return;
  const {url,key}=config();
  await fetch(url+"/storage/v1/object/"+BUCKET,{method:"DELETE",headers:headers(key,true),body:JSON.stringify({prefixes:[path]}),cache:"no-store"});
}

export async function setEnemyImagePath(enemyId:number,path:string|null){
  const {url,key}=config();
  const r=await fetch(url+"/rest/v1/enemy?id=eq."+encodeURIComponent(String(enemyId)),{
    method:"PATCH",headers:{...headers(key,true),Prefer:"return=minimal"},
    body:JSON.stringify({imagePath:path}),cache:"no-store"
  });
  if(!r.ok)throw new Error("No se pudo guardar la referencia de imagen ("+r.status+").");
}

export async function getEnemyImagePaths(ids:number[]){
  if(!ids.length)return new Map<number,string>();
  const {url,key}=config();
  const query=ids.map(String).join(",");
  const r=await fetch(url+"/rest/v1/enemy?id=in.("+query+")&select=id,imagePath",{headers:{...headers(key),Accept:"application/json"},cache:"no-store"});
  if(!r.ok)throw new Error("No se pudieron consultar las imágenes de enemigos.");
  const rows=await r.json();
  return new Map<number,string>(rows.filter((x:any)=>x.imagePath).map((x:any)=>[Number(x.id),String(x.imagePath)]));
}

export async function getDefaultEnemyImageUrl(){
  return getEnemyImageUrl("default.webp");
}
