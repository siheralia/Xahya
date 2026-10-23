"use client";
import { useEffect,useState } from "react";
const fields=[
 ["casinoLow","Ruleta: umbral inferior"],["casinoHigh","Ruleta: umbral superior"],["casinoPenaltyRate","Ruleta: penalización por punto"],["casinoPenaltyMax","Ruleta: penalización máxima"],["casinoBonusRate","Ruleta: bonificación por punto"],["casinoBonusMax","Ruleta: bonificación máxima"],
 ["blackjackLow","Blackjack: umbral inferior"],["blackjackHigh","Blackjack: umbral superior"],["blackjackRate","Blackjack: ajuste por punto"],["blackjackMax","Blackjack: ajuste máximo"],
 ["mazeTrapRate","Laberinto: reducción de trampas por punto"],["mazeTrapMax","Laberinto: reducción máxima de trampas"],["mazeTreasureShare","Laberinto: proporción transferida a tesoros"],
 ["mazeItemBase","Laberinto: probabilidad base de objeto"],["mazeItemRate","Laberinto: incremento de objeto por punto"],["mazeItemMax","Laberinto: probabilidad máxima de objeto"],
 ["mazeMoneyRate","Laberinto: incremento de dinero por punto"],["mazeMoneyMax","Laberinto: bonificación máxima de dinero"]
] as const;
export default function ProbabilityBalanceSettings(){
 const [data,setData]=useState<Record<string,number>>({}),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 useEffect(()=>{fetch("/api/management/stat-balance").then(r=>r.json()).then(j=>{if(j.balance)setData(j.balance);else setMessage(j.error??"Error al cargar");}).catch(()=>setMessage("Error al cargar"));},[]);
 async function save(){setSaving(true);setMessage("");try{const r=await fetch("/api/management/stat-balance",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({balance:data})});const j=await r.json();if(!r.ok)throw Error(j.error??"Error al guardar");setData(j.balance);setMessage("Balance guardado.");}catch(e){setMessage(e instanceof Error?e.message:"Error");}finally{setSaving(false);}}
 return <section className="mt-6 rounded-xl border border-zinc-700 p-4"><h2 className="text-lg font-semibold">Balance de probabilidades</h2><p className="text-sm text-zinc-400 mb-4">Los coeficientes se expresan como decimales: 0.08 equivale al 8 %. Los cambios afectan a las próximas tiradas y habitaciones.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{fields.map(([key,label])=><label key={key} className="text-sm flex flex-col gap-1">{label}<input type="number" min="0" max="100" step="any" className="rounded border border-zinc-600 bg-zinc-900 p-2" value={data[key]??""} onChange={e=>setData(v=>({...v,[key]:Number(e.target.value)}))}/></label>)}</div><button type="button" disabled={saving||Object.keys(data).length===0} onClick={save} className="mt-4 rounded bg-indigo-700 px-4 py-2 disabled:opacity-50">{saving?"Guardando...":"Guardar balance"}</button>{message&&<p className="mt-2 text-sm">{message}</p>}</section>;
}
