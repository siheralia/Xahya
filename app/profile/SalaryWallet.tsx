"use client";
import { useEffect, useState } from "react";
type Wallet={pts:number;karma:number;money:number};
type Role={id:number;name:string;color:string;dailyPts:number;dailyKarma:number;dailyMoney:number};
type Character={id:number;name:string};
export default function SalaryWallet(){
 const [wallet,setWallet]=useState<Wallet>({pts:0,karma:0,money:0});
 const [roles,setRoles]=useState<Role[]>([]);
 const [characters,setCharacters]=useState<Character[]>([]);
 const [characterId,setCharacterId]=useState("");
 const [pts,setPts]=useState(0),[karma,setKarma]=useState(0),[money,setMoney]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [loaded,setLoaded]=useState(false);
 async function refresh(){
  const response=await fetch("/api/profile/salary",{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??"No se pudo cargar el salario.");
  setWallet(data.wallet);setRoles(data.roles??[]);setCharacters(data.characters??[]);setLoaded(true);
 }
 useEffect(()=>{refresh().catch(e=>setError(String(e.message)));},[]);
 async function transfer(){
  if(!characterId||pts+karma+money<=0)return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/profile/salary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({characterId:Number(characterId),pts,karma,money,requestKey:crypto.randomUUID()})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??"No se pudo transferir.");
   setPts(0);setKarma(0);setMoney(0);setMessage("Transferencia realizada y registrada en Audit.");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}finally{setBusy(false);}
 }
 const input="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
 return <section className="mt-8 rounded-2xl border border-cyan-900/50 bg-zinc-900/40 p-6">
  <h2 className="text-2xl font-bold">Mi billetera salarial</h2>
  <p className="mt-2 text-sm text-zinc-400">Tu salario se acumula aquí. Tú decides cuándo y cuánto transferir a uno de tus personajes.</p>
  {error&&<p role="alert" className="mt-3 text-red-400">{error}</p>}{message&&<p className="mt-3 text-emerald-400">{message}</p>}
  {loaded&&<><div className="mt-4 grid grid-cols-3 gap-2 text-center">{([["PTS",wallet.pts],["Karma",wallet.karma],["Dinero",wallet.money]] as const).map(([label,value])=><div key={label} className="rounded-lg border border-zinc-800 p-3"><p className="text-xs text-zinc-400">{label}</p><p className="text-lg font-bold">{value.toLocaleString()}</p></div>)}</div>
  <div className="mt-4 flex flex-wrap gap-2">{roles.map(role=><span key={role.id} className="rounded px-2 py-1 text-xs font-semibold" style={{backgroundColor:role.color,color:"#111"}}>{role.name}: +{role.dailyPts} PTS / +{role.dailyKarma} karma / +{role.dailyMoney} dinero al día</span>)}</div>
  <label className="mt-5 block text-sm">Personaje destinatario<select className={input} value={characterId} onChange={e=>setCharacterId(e.target.value)}><option value="">Selecciona un personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <div className="mt-4 grid grid-cols-3 gap-2">{([["PTS",pts,setPts,wallet.pts],["Karma",karma,setKarma,wallet.karma],["Dinero",money,setMoney,wallet.money]] as const).map(([label,value,setter,max])=><label key={label} className="text-sm">{label}<input type="number" min={0} max={max} step={1} className={input} value={value} onChange={e=>setter(Number(e.target.value))}/></label>)}</div>
  <button disabled={busy||!characterId||![pts,karma,money].every(Number.isSafeInteger)||pts<0||karma<0||money<0||pts>wallet.pts||karma>wallet.karma||money>wallet.money||pts+karma+money===0} onClick={transfer} className="mt-4 w-full rounded-lg bg-cyan-600 px-4 py-3 font-semibold disabled:opacity-40">{busy?"Transfiriendo...":"Transferir al personaje"}</button>
  </>}
 </section>;
}
