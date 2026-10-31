"use client";

import { DEFAULT_DURATION_PRICING, type DurationPricing } from "@/lib/effects/duration-pricing";
import type { EffectPricingMap } from "@/lib/skills/pch";

import Link from "next/link";
import { Badge, Diamond, Heart, Scan, Spade, Sparkles, Zap, RefreshCcw, PanelsTopLeft, Swords, Shield, Flame, Snowflake, Wind, Droplets, Sun, Moon, Star, Eye, Target, Sword, WandSparkles, CircleHelp, Activity, HeartPulse, Cross, Hand, Clock, Timer, Gauge, Footprints, Move, Waves, Bolt, CircleDot, Orbit, Ghost, ShieldCheck, ShieldPlus, ArrowLeftRight, Repeat, RotateCcw, BookOpen, Brain, Gem, Crown, Lock, Key, Circle, Triangle, Hexagon, Layers, Users, User, Skull, Leaf, Feather, Radio, ScanEye, Sparkle, ShieldAlert, CircleOff, Minus, Plus, Percent, TrendingUp, TrendingDown, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Aperture, Focus, ScanLine, ScanFace, ScanHeart, ScanSearch, ScanText, ScanBarcode, PanelsLeftRight, PanelTop, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
const effectIconMap = {sparkles:Sparkles,zap:Zap,"refresh-ccw":RefreshCcw,"panels-top-left":PanelsTopLeft,swords:Swords,shield:Shield,flame:Flame,snowflake:Snowflake,wind:Wind,droplets:Droplets,sun:Sun,moon:Moon,star:Star,eye:Eye,target:Target,sword:Sword,"wand-sparkles":WandSparkles,"circle-help":CircleHelp,activity:Activity,"heart-pulse":HeartPulse,cross:Cross,hand:Hand,clock:Clock,timer:Timer,gauge:Gauge,footprints:Footprints,move:Move,waves:Waves,bolt:Bolt,"circle-dot":CircleDot,orbit:Orbit,ghost:Ghost,"shield-check":ShieldCheck,"shield-plus":ShieldPlus,"arrow-left-right":ArrowLeftRight,repeat:Repeat,"rotate-ccw":RotateCcw,"book-open":BookOpen,brain:Brain,gem:Gem,crown:Crown,lock:Lock,key:Key,circle:Circle,triangle:Triangle,hexagon:Hexagon,layers:Layers,users:Users,user:User,skull:Skull,leaf:Leaf,feather:Feather,radio:Radio,"scan-eye":ScanEye,sparkle:Sparkle,"shield-alert":ShieldAlert,"circle-off":CircleOff,minus:Minus,plus:Plus,percent:Percent,"trending-up":TrendingUp,"trending-down":TrendingDown,"arrow-up":ArrowUp,"arrow-down":ArrowDown,"arrow-right":ArrowRight,"arrow-left":ArrowLeft,aperture:Aperture,focus:Focus,"scan-line":ScanLine,"scan-face":ScanFace,"scan-heart":ScanHeart,"scan-search":ScanSearch,"scan-text":ScanText,"scan-barcode":ScanBarcode,"panels-left-right":PanelsLeftRight,"panel-top":PanelTop,"panel-bottom":PanelBottom,"panel-left":PanelLeft,"panel-right":PanelRight} as const;
const iconNames: string[] = Object.keys(effectIconMap);
function DynamicIcon({name,size=24,...props}:{name:string;size?:number;strokeWidth?:number;"aria-hidden"?:boolean}) { const Icon = effectIconMap[name as keyof typeof effectIconMap] ?? Sparkles; return <Icon size={size} {...props}/>; }
import { useEffect, useState } from "react";

type Target = { key: string; label: string };
type EffectDefinition = { type: string; label: string; description: string; icon?: string; mode: string; targets: Target[] };
type Statistic = { key: string; code?: string; name: string; kind: string };

const modes: Record<string, string> = {
  bonus: "Suma fija", multiplier: "Multiplicador", text: "Narrativo", special: "Especial",
};

export default function EffectsManagementPage() {
  const [effects, setEffects] = useState<EffectDefinition[]>([]);
  const [cards,setCards] = useState<{id:string;name:string;description:string;category:string;icon:string;pch:number;enabled:boolean}[]>([]);
  const [editing,setEditing] = useState<{kind:"mechanical"|"custom";id:string}|null>(null);
  const [draft,setDraft] = useState<{name:string;description:string;icon:string;pch:number;enabled:boolean}>({name:"",description:"",icon:"sparkles",pch:0,enabled:true});
  const [iconSearch,setIconSearch] = useState("");
  const [cardName,setCardName] = useState("");
  const [cardDescription,setCardDescription] = useState("");
  const [cardPch,setCardPch] = useState(5);
  const [newIcon,setNewIcon] = useState("sparkles");
  const [showCreator,setShowCreator] = useState(false);
  useEffect(()=>{fetch("/api/effects/narrative-cards",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error??"No se pudo cargar el catálogo");return d;}).then(d=>setCards(d.cards??[])).catch(e=>setNotice(e instanceof Error?e.message:"Error al cargar tarjetas"));},[]);
  async function saveCard(card:{id:string;name:string;description:string;icon:string;pch:number;enabled:boolean}) {
    setSaving(card.id);
    try {
      const response=await fetch("/api/effects/narrative-cards",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(card)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error??"Error");
      setCards(old=>old.map(c=>c.id===card.id?data.card:c));setNotice("Tarjeta actualizada");return true;
    }catch(e){setNotice(e instanceof Error?e.message:"Error");return false;}finally{setSaving(null);}
  }
  async function createCard(){
    setSaving("new-card");
    try {
      const response=await fetch("/api/effects/narrative-cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:cardName,description:cardDescription,category:"Narrativo",icon:newIcon,pch:cardPch})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error??"Error");
      setCards(old=>[...old,data.card]);setCardName("");setCardDescription("");setNewIcon("sparkles");setNotice("Tarjeta creada y guardada correctamente.");setShowCreator(false);document.getElementById("custom-effect-catalog")?.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}
  }

  async function saveMetadata(effect:EffectDefinition) {
    setSaving("metadata:"+effect.type);setNotice("");
    try {
      const response=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"metadata",type:effect.type,label:effect.label,description:effect.description,icon:effect.icon ?? "sparkles"})});
      const data=await response.json();if(!response.ok)throw Error(data.error??"No se pudo guardar");
      setNotice("Datos del efecto actualizados.");return true;
    }catch(e){setNotice(e instanceof Error?e.message:"Error");return false;}finally{setSaving(null);}
  }
  const [pricing,setPricing] = useState<EffectPricingMap>({});
  const [defaultSpeed,setDefaultSpeed] = useState("agility");
  const [speedStats,setSpeedStats] = useState<{key:string;name:string}[]>([{key:"agility",name:"Agilidad"}]);
  const [durationPricing,setDurationPricing] = useState<DurationPricing>(DEFAULT_DURATION_PRICING);
  const [saving,setSaving] = useState<string|null>(null);
  const [notice,setNotice] = useState("");
  useEffect(()=>{ fetch("/api/management/effects").then(r=>r.ok?r.json():null).then(data=>{if(data?.pricing)setPricing(data.pricing);if(data?.defaultAttackSpeedStat)setDefaultSpeed(data.defaultAttackSpeedStat);if(data?.attackSpeedStats)setSpeedStats(data.attackSpeedStats);if(data?.durationPricing)setDurationPricing(data.durationPricing);}).catch(()=>{});},[]);
  async function savePricing(type:string){setSaving(type);setNotice("");try{const response=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,...pricing[type]})});const data=await response.json();if(!response.ok)throw Error(data.error??"No se pudo guardar");setPricing(data.pricing);setNotice("Precio actualizado.");}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}}

  async function saveDurationPricing(){setSaving("duration");setNotice("");try{const response=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"duration-pricing",pricing:durationPricing})});const data=await response.json();if(!response.ok)throw Error(data.error??"Error al guardar");setDurationPricing(data.durationPricing);setNotice("Reglas de duración guardadas.");}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}}

  async function saveDefaultSpeed(){setSaving("speed");setNotice("");try{const response=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"default-attack-speed",statKey:defaultSpeed})});const data=await response.json();if(!response.ok)throw Error(data.error??"Error");setDefaultSpeed(data.defaultAttackSpeedStat);setNotice("Velocidad predeterminada guardada.");}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setSaving(null);}}
  const [statistics, setStatistics] = useState<Statistic[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/management/effect-targets", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No tienes acceso a la gestión de efectos.");
        return response.json();
      })
      .then((data) => {
        setEffects(Array.isArray(data.effects) ? data.effects : []);
        setStatistics(Array.isArray(data.statistics) ? data.statistics : []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar los efectos."))
      .finally(() => setLoading(false));
  }, []);

  const visible = effects.filter((effect) => (effect.label + " " + effect.type + " " + effect.mode).toLowerCase().includes(search.toLowerCase()));
  const active = effects.find((effect) => effect.type === selected);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <div className="space-y-2">
        <Link href="/management" className="text-sm text-cyan-300 hover:underline">← Administración</Link>
        <h1 className="text-3xl font-bold">Gestión de efectos</h1>
        <p className="text-sm text-zinc-400">Catálogo central de efectos mecánicos y narrativos elegibles para habilidades, perks y objetos. Las propuestas pendientes de mecánica funcionan como narrativas. Los precios se pueden editar aquí; las habilidades existentes conservan su costo histórico.</p>
      </div>
      <section className="rounded-xl border border-zinc-700 p-4"><h2 className="font-semibold">Velocidad predeterminada de ataques</h2><p className="my-2 text-sm text-zinc-400">Las habilidades con «Por defecto» consultan esta estadística al ejecutarse. Una velocidad distinta suma 5 PCH al crear la habilidad.</p><div className="flex gap-2"><select aria-label="Estadística predeterminada de velocidad" value={defaultSpeed} onChange={e=>setDefaultSpeed(e.target.value)} className="rounded bg-zinc-900 p-2">{speedStats.map(stat=><option key={stat.key} value={stat.key}>{stat.name}</option>)}</select><button type="button" disabled={saving==="speed"} onClick={saveDefaultSpeed} className="rounded bg-cyan-700 px-3 py-2">Guardar</button></div></section>
      {notice && <p role="status" className="text-sm text-cyan-300">{notice}</p>}
      <section className="space-y-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-semibold">Costo PCH por duración</h2><p className="text-sm text-zinc-400">Los turnos aumentan el costo de cada efecto. La duración se registra en la habilidad; su contador se implementará después en combate.</p><div className="grid gap-3 sm:grid-cols-4">{([["instant","Multiplicador instantáneo"],["oneTurn","Multiplicador de 1 turno"],["perExtraTurn","Incremento por turno extra"],["perMovement","Multiplicador por movimiento"]] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input type="number" min="0" max="10" step="0.05" value={durationPricing[key] ?? 0.2} onChange={e=>setDurationPricing(p=>({...p,[key]:Number(e.target.value)}))} className="mt-1 w-full rounded bg-zinc-950 p-2"/></label>)}</div><button type="button" disabled={saving!==null} onClick={saveDurationPricing} className="rounded bg-cyan-700 px-4 py-2 disabled:opacity-40">Guardar reglas de duración</button></section>

      <section className="space-y-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Catálogo de efectos</h2>
        <input aria-label="Filtrar efectos" placeholder="Buscar por nombre, código o descripción…" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-lg border border-zinc-600 bg-zinc-950 p-3"/>
        <p className="text-xs text-zinc-400">Selecciona un efecto para abrir el editor compartido.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {effects.filter(e=>(e.label+" "+e.type+" "+e.description).toLowerCase().includes(search.toLowerCase())).map(e=><button key={e.type} type="button" onClick={()=>{setEditing({kind:"mechanical",id:e.type});setDraft({name:e.label,description:e.description??"",icon:e.icon??"sparkles",pch:pricing[e.type]?.base??0,enabled:pricing[e.type]?.enabled??true});setIconSearch("");}} className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-left hover:border-cyan-500"><DynamicIcon name={e.icon??"sparkles"} size={24}/><span className="min-w-0"><span className="block truncate font-semibold">{e.label}</span><span className="block truncate text-xs text-zinc-400">{e.type}</span></span></button>)}
          {cards.filter(c=>(c.name+" "+c.description).toLowerCase().includes(search.toLowerCase())).map(c=><button key={c.id} type="button" onClick={()=>{setEditing({kind:"custom",id:c.id});setDraft({name:c.name,description:c.description,icon:c.icon??"sparkles",pch:c.pch,enabled:c.enabled});setIconSearch("");}} className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-left hover:border-cyan-500"><DynamicIcon name={c.icon??"sparkles"} size={24}/><span className="min-w-0"><span className="block truncate font-semibold">{c.name}</span><span className="block text-xs text-zinc-400">Personalizado</span></span></button>)}
        </div>
        {!loading && effects.length===0 && <p className="text-zinc-400">No se cargaron efectos mecánicos.</p>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
      </section>
      <section className="space-y-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Crear efecto personalizado</h2>
        <button type="button" onClick={()=>setShowCreator(v=>!v)} className="rounded-lg border border-cyan-700 px-4 py-2">{showCreator?"Cancelar":"+ Nuevo efecto"}</button>
        {showCreator && <div className="space-y-3">
          <input aria-label="Nombre del nuevo efecto" placeholder="Nombre" value={cardName} onChange={e=>setCardName(e.target.value)} className="w-full rounded bg-zinc-950 p-3"/>
          <textarea aria-label="Descripción del nuevo efecto" placeholder="Descripción" value={cardDescription} onChange={e=>setCardDescription(e.target.value)} className="w-full rounded bg-zinc-950 p-3"/>
          <label className="block text-sm">Costo PCH<input type="number" min={0} value={cardPch} onChange={e=>setCardPch(Number(e.target.value))} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label>
          <label className="block text-sm">Nombre del icono Lucide (manual)<input value={newIcon} onChange={e=>setNewIcon(e.target.value.trim().toLowerCase())} placeholder="Ej. shield, flame, wand-sparkles" maxLength={40} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label><p className="text-xs text-zinc-400">Puedes escribir otro nombre en kebab-case. Si no está en la biblioteca visual disponible, se mostrará un icono genérico hasta que se incorpore.</p>
          <label className="block text-sm">Buscar icono<input placeholder="Filtrar iconos…" value={iconSearch} onChange={e=>setIconSearch(e.target.value)} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label>
          <div className="grid max-h-44 grid-cols-6 gap-2 overflow-y-auto">{iconNames.filter(n=>n.includes(iconSearch.toLowerCase())).map(n=><button type="button" key={n} title={n} aria-label={n} aria-pressed={newIcon===n} onClick={()=>setNewIcon(n)} className={"rounded p-2 "+(newIcon===n?"bg-cyan-700":"bg-zinc-800")}><DynamicIcon name={n} size={22}/></button>)}</div>
          <button type="button" disabled={saving!==null||!cardName.trim()||!cardDescription.trim()||!/^[a-z0-9-]{1,40}$/.test(newIcon)} onClick={createCard} className="rounded bg-cyan-700 px-4 py-2 disabled:opacity-50">Crear efecto</button>
        </div>}
      </section>
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null);}}>
        <section role="dialog" aria-modal="true" aria-label="Editar efecto" className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl border border-zinc-600 bg-zinc-900 p-5">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Editar efecto</h2><button type="button" onClick={()=>setEditing(null)} className="rounded border border-zinc-600 px-3 py-1">Cerrar</button></div>
          <label className="block text-sm">Nombre<input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label>
          <label className="block text-sm">Descripción<textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label>
          <label className="block text-sm">Nombre del icono Lucide (manual)<input value={draft.icon} onChange={e=>setDraft(d=>({...d,icon:e.target.value.trim().toLowerCase()}))} maxLength={40} placeholder="Ej. shield, flame, wand-sparkles" className="mt-1 w-full rounded bg-zinc-950 p-3"/></label><p className="text-xs text-zinc-400">Los nombres que no estén cargados en la biblioteca visual se mostrarán temporalmente como destellos.</p>
          <label className="block text-sm">Buscar icono<input value={iconSearch} onChange={e=>setIconSearch(e.target.value)} placeholder="Ej. flame, shield, heart…" className="mt-1 w-full rounded bg-zinc-950 p-3"/></label>
          <div className="flex items-center gap-2 text-sm text-cyan-300"><DynamicIcon name={draft.icon} size={28}/><span>Icono seleccionado: {draft.icon}</span></div>
          <div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto">{iconNames.filter(n=>n.includes(iconSearch.toLowerCase())).map(n=><button type="button" key={n} title={n} aria-label={n} aria-pressed={draft.icon===n} onClick={()=>setDraft(d=>({...d,icon:n}))} className={"rounded p-2 "+(draft.icon===n?"bg-cyan-700":"bg-zinc-800")}><DynamicIcon name={n} size={23}/></button>)}</div>
          {editing.kind==="custom" && <><label className="block text-sm">Costo PCH<input type="number" min={0} value={draft.pch} onChange={e=>setDraft(d=>({...d,pch:Number(e.target.value)}))} className="mt-1 w-full rounded bg-zinc-950 p-3"/></label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft(d=>({...d,enabled:e.target.checked}))}/>Disponible</label></>}
          {editing.kind==="mechanical" && <p className="text-xs text-zinc-400">El precio y disponibilidad mecánicos se administran por separado.</p>}
          <button type="button" disabled={saving!==null||!draft.name.trim()||!/^[a-z0-9-]{1,40}$/.test(draft.icon)||(editing.kind==="custom"&&!draft.description.trim())} onClick={async()=>{
            const saved = editing.kind==="custom" ? await saveCard({id:editing.id,name:draft.name,description:draft.description,icon:draft.icon,pch:draft.pch,enabled:draft.enabled}) : await saveMetadata({type:editing.id,label:draft.name,description:draft.description,icon:draft.icon,mode:"",targets:[]});
            if (!saved) return;
            setEditing(null);
            if(editing.kind==="mechanical")setEffects(old=>old.map(e=>e.type===editing.id?{...e,label:draft.name,description:draft.description,icon:draft.icon}:e));
          }} className="rounded bg-cyan-700 px-4 py-2 disabled:opacity-50">Guardar cambios</button>
        </section>
      </div>}
    </main>
  );
}
