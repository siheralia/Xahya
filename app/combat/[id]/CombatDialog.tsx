"use client";
import {useEffect,type ReactNode} from "react";
import {X} from "lucide-react";
export default function CombatDialog({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
 useEffect(()=>{
  if(!open)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[open,onClose]);
 return <div className={open?"xahya-modal-overlay flex items-center justify-center bg-black/75 p-2 sm:p-4":"hidden"} role={open?"dialog":undefined} aria-modal={open||undefined}
  aria-label={title} aria-hidden={!open} onClick={onClose}>
  <section className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
    onClick={e=>e.stopPropagation()}>
   <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    <button type="button" onClick={onClose} aria-label="Cerrar panel"
     className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-700 text-zinc-400 hover:text-white"><X size={18}/></button>
   </header>
   <div className="min-h-0 overflow-y-auto p-3 sm:p-5">{children}</div>
  </section>
 </div>;
}
