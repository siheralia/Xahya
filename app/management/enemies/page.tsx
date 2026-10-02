"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

type Theme={id:number;name:string;slug:string;description:string|null;active:boolean};
type Loot={type:"money"|"karma"|"item";amount:number;itemId?:number;quantity?:number};
type Enemy={
 id:number;name:string;description:string|null;rank:string;stats:any;abilities:any;loot:any;
 encounterWeight:number;capturability:number;isBoss:boolean;active:boolean;imageUrl?:string|null;
 themeIds:number[];themes:Theme[]
};
type Item={id:number;name:string;itemType:string;itemSubtype:string|null};

const emptyLoot=():Loot=>({type:"money",amount:100});
const emptyForm=()=>({
 name:"",description:"",rank:"NORMAL",weight:1,capturability:0,boss:false,active:true,
 themeIds:[] as number[],loot:[] as Loot[],stats:{},abilities:[] as any[]
});

async function compress(file:File){
 const bitmap=await createImageBitmap(file),size=256,canvas=document.createElement("canvas");
 canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext("2d");if(!ctx)throw new Error("No se pudo preparar la imagen.");
 const scale=Math.max(size/bitmap.width,size/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
 ctx.drawImage(bitmap,(size-w)/2,(size-h)/2,w,h);bitmap.close();
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("No se pudo comprimir.")),"image/webp",.82));
}

function normalizeLoot(value:any):Loot[]{
 if(!Array.isArray(value))return[];
 return value.map((entry:any)=>{
   const type=["money","karma","item"].includes(String(entry?.type))?String(entry.type):"money";
   if(type==="item")return {type:"item",itemId:Number(entry?.itemId??0),quantity:Math.max(1,Number(entry?.quantity??entry?.amount??1))};
   return {type:type as "money"|"karma",amount:Math.max(0,Number(entry?.amount??entry?.quantity??entry?.value??0))};
 });
}

const lootLabels:{[key:string]:string}={money:"💰 Monedas",karma:"🪷 Karma",item:"🎒 Objeto"};

export default function EnemyManagement(){
 const [enemies,setEnemies]=useState<Enemy[]>([]);
 const [themes,setThemes]=useState<Theme[]>([]);
 const [items,setItems]=useState<Item[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [form,setForm]=useState(emptyForm());
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [defaultImage,setDefaultImage]=useState<string|null>(null);

 async function load(){
   setLoading(true);setError("");
   try{
     const [er,tr,ir]=await Promise.all([
       fetch("/api/management/enemies",{cache:"no-store"}),
       fetch("/api/management/themes",{cache:"no-store"}),
       fetch("/api/management/items",{cache:"no-store"})
     ]);
     const ed=await er.json();if(!er.ok)throw new Error(ed?.error??"No se pudo cargar.");
     const td=await tr.json(),id=await ir.json();
     setEnemies(ed.enemies??[]);
     setDefaultImage(ed.defaultImageUrl??null);
     setThemes(tr.ok&&Array.isArray(td)?td.filter((t:Theme)=>t.active):[]);
     setItems(ir.ok?(id.items??[]):[]);
   }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el catálogo.");}
   finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);

 function edit(enemy:Enemy){
   setSelected(enemy.id);
   setForm({
     name:enemy.name,description:enemy.description??"",rank:enemy.rank,weight:Number(enemy.encounterWeight)||1,
     capturability:Number(enemy.capturability)||0,boss:Boolean(enemy.isBoss),active:Boolean(enemy.active),
     themeIds:Array.isArray(enemy.themeIds)?enemy.themeIds.map(Number):[],
     loot:normalizeLoot(enemy.loot),
     stats:enemy.stats??{},abilities:Array.isArray(enemy.abilities)?enemy.abilities:[]
   });
   setSuccess("");setError("");
   window.scrollTo({top:0,behavior:"smooth"});
 }
 function newEnemy(){
   setSelected(null);setForm(emptyForm());setSuccess("");setError("");
   window.scrollTo({top:0,behavior:"smooth"});
 }
 function updateLoot(index:number,key:string,value:string){
   setForm(f=>({...f,loot:f.loot.map((loot,i)=>{
     if(i!==index)return loot;
     if(key==="type"){
       return value==="item"?{type:"item",itemId:items[0]?.id??0,quantity:1}:{type:value as "money"|"karma",amount:100};
     }
     return {...loot,[key]:Number(value)||0};
   })}));
 }
 async function save(){
   setSaving(true);setError("");setSuccess("");
   try{
     const payload={
       name:form.name,description:form.description,rank:form.rank,encounterWeight:form.weight,
       capturability:form.capturability,isBoss:form.boss,active:form.active,themeIds:form.themeIds,
       loot:form.loot.map(l=>l.type==="item"
         ? {type:"item",itemId:Number(l.itemId),quantity:Math.max(1,Number(l.quantity)||1)}
         : {type:l.type,amount:Math.max(0,Number(l.amount)||0)}),
       stats:form.stats,abilities:form.abilities
     };
     const url=selected?"/api/management/enemies/"+selected:"/api/management/enemies";
     const r=await fetch(url,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
     const d=await r.json();if(!r.ok)throw new Error(d?.error??"No se pudo guardar.");
     setSuccess(selected?"Enemigo actualizado correctamente.":"Enemigo creado correctamente.");
     await load();
     const saved=d?.enemy??d;
     if(saved?.id){
       const fresh=(await (await fetch("/api/management/enemies",{cache:"no-store"})).json()).enemies?.find((e:Enemy)=>Number(e.id)===Number(saved.id));
       if(fresh)edit(fresh);
     }
   }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
   finally{setSaving(false);}
 }
 async function upload(file:File,enemyId?:number){
   setSaving(true);setError("");
   try{
     const formData=new FormData();formData.append("file",await compress(file),"enemy.webp");
     if(enemyId)formData.append("enemyId",String(enemyId));else formData.append("default","true");
     const r=await fetch("/api/management/enemies/image",{method:"POST",body:formData});
     const raw=await r.text();let d:any=null;try{d=raw?JSON.parse(raw):null;}catch{throw new Error("El servidor devolvió un error al subir la imagen ("+r.status+").");}
     if(!r.ok)throw new Error(d?.error??"No se pudo subir la imagen.");
     await load();
   }catch(e){setError(e instanceof Error?e.message:"No se pudo subir.");}
   finally{setSaving(false);}
 }

 if(loading)return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando enemigos...</p></main>;

 return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-6">
   <div className="flex flex-wrap items-end justify-between gap-4">
     <div><h1 className="text-4xl font-bold">Catálogo de enemigos</h1><p className="mt-2 text-zinc-500">Selecciona un enemigo para cargar toda su configuración en el formulario. La imagen se cambia directamente desde su mini menú.</p></div>
     <div className="flex gap-2"><button onClick={newEnemy} className="rounded-lg bg-white px-5 py-3 font-medium text-black">Nuevo enemigo</button><Link href="/management" className="rounded-lg border border-zinc-700 px-4 py-3">← Gestión</Link></div>
   </div>
   {error&&<div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
   {success&&<div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

   <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
     <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
       <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Enemigos</h2><span className="text-xs text-zinc-600">{enemies.length} registrados</span></div>
       <div className="mt-4 space-y-2">
         {enemies.map(e=><div key={e.id} onClick={()=>edit(e)} className={"flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition "+(selected===e.id?"border-violet-400/50 bg-violet-950/20":"border-zinc-800 hover:bg-zinc-900")}>
           <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">{e.imageUrl||defaultImage?<img src={e.imageUrl??defaultImage??""} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-[9px] text-zinc-600">Sin imagen</div>}</div>
           <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="font-medium truncate">{e.name}</span><span className="text-[10px] text-zinc-500">{e.rank}{e.isBoss?" · JEFE":""}</span></div><p className="mt-1 line-clamp-2 text-xs text-zinc-500">{e.description||"Sin descripción."}</p></div>
           <label title="Cambiar imagen" className="cursor-pointer rounded-lg border border-zinc-700 px-2 py-2 text-xs text-zinc-300" onClick={ev=>ev.stopPropagation()}>🖼️<input type="file" accept="image/*" className="hidden" disabled={saving} onChange={ev=>{const f=ev.target.files?.[0];if(f)upload(f,e.id);ev.currentTarget.value="";}}/></label>
         </div>)}
       </div>
       <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">La imagen es la única edición disponible en esta lista. Nombre, descripción, estadísticas, peso, jefe, captura, temáticas y loot se editan en el formulario.</div>
       <div className="mt-4 rounded-lg border border-zinc-800 p-3"><p className="text-sm font-medium">Imagen genérica</p><p className="mt-1 text-xs text-zinc-500">Se usa cuando un enemigo no tiene imagen propia.</p><label className="mt-2 inline-block cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-xs">Subir/cambiar<input type="file" accept="image/*" className="hidden" disabled={saving} onChange={ev=>{const f=ev.target.files?.[0];if(f)upload(f);ev.currentTarget.value="";}}/></label>{defaultImage&&<img src={defaultImage} alt="" className="mt-3 h-14 w-14 rounded-lg object-cover"/>}</div>
     </section>

     <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
       <h2 className="text-xl font-semibold">{selected?"Editar enemigo":"Crear enemigo"}</h2>
       <div className="mt-5 grid gap-4">
         <label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
         <label>Descripción<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
         <div className="grid gap-4 sm:grid-cols-2">
           <label>Rango<select value={form.rank} onChange={e=>setForm({...form,rank:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option>NORMAL</option><option>ELITE</option><option>BOSS</option></select></label>
           <label>Peso de aparición<input type="number" min={1} value={form.weight} onChange={e=>setForm({...form,weight:Math.max(1,Number(e.target.value)||1)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
           <label>Capturabilidad<input type="number" min={0} value={form.capturability} onChange={e=>setForm({...form,capturability:Math.max(0,Number(e.target.value)||0)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/><span className="text-xs text-zinc-600">0 = no capturable.</span></label>
           <div className="flex gap-5 pt-8"><label className="flex items-center gap-2"><input type="checkbox" checked={form.boss} onChange={e=>setForm({...form,boss:e.target.checked})}/> Puede aparecer como jefe</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Activo</label></div>
         </div>

         <div><p className="font-medium">Temáticas</p><div className="mt-2 flex flex-wrap gap-2">{themes.map(t=><button type="button" key={t.id} onClick={()=>setForm(f=>({...f,themeIds:f.themeIds.includes(t.id)?f.themeIds.filter(id=>id!==t.id):[...f.themeIds,t.id]}))} className={"rounded-full border px-3 py-1.5 text-xs "+(form.themeIds.includes(t.id)?"border-violet-400 bg-violet-400/15 text-violet-200":"border-zinc-700 text-zinc-400")}>{t.slug==="TODAS"?"🌐 ":""}{t.name}</button>)}</div><p className="mt-1 text-xs text-zinc-600">Sin selección = GENERAL. TODAS permite al enemigo aparecer en cualquier temática.</p></div>

         <div><div className="flex items-center justify-between"><div><h3 className="font-medium">Loot / recompensas</h3><p className="mt-1 text-xs text-zinc-500">Ya no depende del tesoro del laberinto: cada enemigo puede tener sus propias recompensas.</p></div><button type="button" onClick={()=>setForm(f=>({...f,loot:[...f.loot,emptyLoot()]}))} className="text-sm text-zinc-300">+ Añadir recompensa</button></div>
           <div className="mt-3 space-y-3">{form.loot.length===0&&<p className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-600">Sin loot configurado. Este enemigo no entrega recompensas propias.</p>}
           {form.loot.map((loot,i)=><div key={i} className="rounded-xl border border-zinc-800 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
             <select value={loot.type} onChange={e=>updateLoot(i,"type",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{Object.entries(lootLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
             {loot.type==="item"?<select value={loot.itemId??0} onChange={e=>updateLoot(i,"itemId",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value={0}>Selecciona objeto</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}{item.itemSubtype?" · "+item.itemSubtype:""}</option>)}</select>:<input type="number" min={0} value={loot.amount} onChange={e=>updateLoot(i,"amount",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Cantidad"/>}
             {loot.type==="item"?<input type="number" min={1} value={loot.quantity??1} onChange={e=>updateLoot(i,"quantity",e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" placeholder="Cantidad"/>:<span className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-600">por enemigo</span>}
           </div><button type="button" onClick={()=>setForm(f=>({...f,loot:f.loot.filter((_,j)=>j!==i)}))} className="mt-2 text-sm text-red-300">Quitar recompensa</button></div>)}</div>
         </div>

         <details className="rounded-xl border border-zinc-800 p-4"><summary className="cursor-pointer text-sm font-medium">Configuración avanzada</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-500">Stats del enemigo<textarea readOnly value={JSON.stringify(form.stats,null,2)} rows={7} className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500"/></label><label className="text-xs text-zinc-500">Habilidades<textarea readOnly value={JSON.stringify(form.abilities,null,2)} rows={7} className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500"/></label></div></details>

         <button onClick={save} disabled={saving||!form.name.trim()} className="rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-40">{saving?"Guardando...":selected?"Guardar cambios":"Crear enemigo"}</button>
       </div>
     </section>
   </div>
 </div></main>;
}
