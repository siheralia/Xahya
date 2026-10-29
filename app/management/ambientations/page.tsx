"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Layer={id:string;imageUrl:string;position:string;width:number;opacity:number;animation:string};
type Ambient={id:string;name:string;enabled:boolean;starts_at:string|null;ends_at:string|null;layers:Layer[]};
async function optimizeWebp(file:File):Promise<File> {
 if(file.size>5*1024*1024) throw Error("La imagen original supera 5 MB.");
 const bitmap=await createImageBitmap(file);
 try {
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("No se pudo convertir a WebP.")),"image/webp",0.82));
  if(blob.type!=="image/webp")throw Error("Tu navegador no admite conversión a WebP.");
  if(blob.size>5*1024*1024)throw Error("La imagen optimizada supera 5 MB.");
  return new File([blob],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"});
 } finally {bitmap.close();}
}
export default function Ambientaciones() {
 const [items,setItems]=useState<Ambient[]>([]);
 const [selected,setSelected]=useState("");
 const [name,setName]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const current=items.find(i=>i.id===selected);
 async function reload(){const r=await fetch("/api/management/ambientations",{cache:"no-store"});if(!r.ok)throw Error("No se pudieron cargar las ambientaciones");const data=await r.json();setItems(data);setSelected(v=>v||data[0]?.id||"");}
 useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
 function edit(patch:Partial<Ambient>){setItems(v=>v.map(i=>i.id===selected?{...i,...patch}:i));}
 function editLayer(id:string,patch:Partial<Layer>){if(current)edit({layers:current.layers.map(l=>l.id===id?{...l,...patch}:l)});}
 async function create(){setBusy(true);setError("");try{const r=await fetch("/api/management/ambientations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});if(!r.ok)throw Error("No se pudo crear");const data=await r.json();setName("");await reload();setSelected(data[0].id);}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function upload(file:File){setBusy(true);setError("");try{const form=new FormData();form.set("file",await optimizeWebp(file));const r=await fetch("/api/management/ambientations/upload",{method:"POST",body:form});const data=await r.json();if(!r.ok)throw Error(data.error||"Error al subir");if(current)edit({layers:[...current.layers,{id:crypto.randomUUID(),imageUrl:data.imageUrl,position:"top-right",width:140,opacity:85,animation:"float"}]});}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function save(){if(!current)return;setBusy(true);setError("");setNotice("");try{const r=await fetch("/api/management/ambientations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(current)});const data=await r.json();if(!r.ok)throw Error(data.error||"Error al guardar");await reload();setNotice("Ambientación guardada.");}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <main className="mx-auto max-w-4xl space-y-5 p-5 text-zinc-100">
 <Link href="/management" className="text-sm text-cyan-300">← Gestión</Link>
 <h1 className="text-2xl font-bold">Ambientaciones estacionales</h1>
 <p className="text-sm text-zinc-400">Decoración global sin modificar los temas de los personajes. Las imágenes se superponen sin bloquear controles.</p>
 <div className="flex flex-wrap gap-2"><input aria-label="Nueva ambientación" className="rounded bg-zinc-800 p-2" placeholder="Nombre de ambientación" value={name} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()} onClick={create} className="rounded bg-indigo-700 px-4 py-2 disabled:opacity-40">Crear</button></div>
 {error&&<p role="alert" className="text-red-400">{error}</p>}{notice&&<p role="status" className="text-green-400">{notice}</p>}
 <select aria-label="Ambientación" className="w-full rounded bg-zinc-800 p-2" value={selected} onChange={e=>setSelected(e.target.value)}>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select>
 {current&&<section className="space-y-4 rounded-xl border border-zinc-700 p-4">
 <label className="block">Nombre<input className="mt-1 w-full rounded bg-zinc-800 p-2" value={current.name} onChange={e=>edit({name:e.target.value})}/></label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={current.enabled} onChange={e=>edit({enabled:e.target.checked})}/>Activar esta ambientación (desactiva la anterior)</label>
 <div className="grid gap-3 sm:grid-cols-2">{(["starts_at","ends_at"] as const).map(k=><label key={k}>{k==="starts_at"?"Comienza":"Termina"}<input type="datetime-local" className="mt-1 w-full rounded bg-zinc-800 p-2" value={current[k]?.slice(0,16)||""} onChange={e=>edit({[k]:e.target.value?new Date(e.target.value).toISOString():null})}/></label>)}</div>
 <label className="block rounded border border-dashed border-zinc-600 p-4">Añadir imagen (PNG, JPG, WebP o GIF; 5 MB). Se reduce a 1600 px y convierte a WebP; los GIF pierden su animación.<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 block w-full text-sm" disabled={busy||current.layers.length>=20} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value="";}}/></label>
 {current.layers.map(l=><div key={l.id} className="grid gap-3 rounded border border-zinc-700 p-3 sm:grid-cols-2">
 <img src={l.imageUrl} alt="Vista previa de capa" className="max-h-28 max-w-36 object-contain"/>
 <div className="flex justify-end"><button className="text-red-300" onClick={()=>edit({layers:current.layers.filter(x=>x.id!==l.id)})}>Quitar imagen</button></div>
 <label>Posición<select className="block w-full rounded bg-zinc-800 p-2" value={l.position} onChange={e=>editLayer(l.id,{position:e.target.value})}>{["top-left","top-right","bottom-left","bottom-right"].map(p=><option key={p} value={p}>{({"top-left":"Superior izquierda","top-right":"Superior derecha","bottom-left":"Inferior izquierda","bottom-right":"Inferior derecha"} as Record<string,string>)[p]}</option>)}</select></label>
 <label>Animación<select className="block w-full rounded bg-zinc-800 p-2" value={l.animation} onChange={e=>editLayer(l.id,{animation:e.target.value})}>{["none","float","swing","pulse","fall"].map(p=><option key={p} value={p}>{({"none":"Ninguna","float":"Flotar","swing":"Balancearse","pulse":"Brillar","fall":"Caer"} as Record<string,string>)[p]}</option>)}</select></label>
 <label>Ancho: {l.width}px<input type="range" min="30" max="360" value={l.width} className="block w-full" onChange={e=>editLayer(l.id,{width:Number(e.target.value)})}/></label>
 <label>Opacidad: {l.opacity}%<input type="range" min="0" max="100" value={l.opacity} className="block w-full" onChange={e=>editLayer(l.id,{opacity:Number(e.target.value)})}/></label>
 </div>)}
 <button disabled={busy||!current.name.trim()} onClick={save} className="rounded bg-indigo-700 px-5 py-2 disabled:opacity-40">Guardar cambios</button>
 </section>}
 </main>;
}
