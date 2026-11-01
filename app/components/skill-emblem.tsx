"use client";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { lazy, Suspense, useEffect, useId, useState, type ComponentType } from "react";
import { Badge, Diamond, Heart, Scan, Spade, Sparkles, Zap, RefreshCcw, PanelsTopLeft, Swords, Shield, Flame, Snowflake, Wind, Droplets, Sun, Moon, Star, Eye, Target, Sword, WandSparkles, CircleHelp, Activity, HeartPulse, Cross, Hand, Clock, Timer, Gauge, Footprints, Move, Waves, Bolt, CircleDot, Orbit, Ghost, ShieldCheck, ShieldPlus, ArrowLeftRight, Repeat, RotateCcw, BookOpen, Brain, Gem, Crown, Lock, Key, Circle, Triangle, Hexagon, Layers, Users, User, Skull, Leaf, Feather, Radio, ScanEye, Sparkle, ShieldAlert, CircleOff, Minus, Plus, Percent, TrendingUp, TrendingDown, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Aperture, Focus, ScanLine, ScanFace, ScanHeart, ScanSearch, ScanText, ScanBarcode, PanelsLeftRight, PanelTop, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
const effectIconMap = {sparkles:Sparkles,zap:Zap,"refresh-ccw":RefreshCcw,"panels-top-left":PanelsTopLeft,swords:Swords,shield:Shield,flame:Flame,snowflake:Snowflake,wind:Wind,droplets:Droplets,sun:Sun,moon:Moon,star:Star,eye:Eye,target:Target,sword:Sword,"wand-sparkles":WandSparkles,"circle-help":CircleHelp,activity:Activity,"heart-pulse":HeartPulse,cross:Cross,hand:Hand,clock:Clock,timer:Timer,gauge:Gauge,footprints:Footprints,move:Move,waves:Waves,bolt:Bolt,"circle-dot":CircleDot,orbit:Orbit,ghost:Ghost,"shield-check":ShieldCheck,"shield-plus":ShieldPlus,"arrow-left-right":ArrowLeftRight,repeat:Repeat,"rotate-ccw":RotateCcw,"book-open":BookOpen,brain:Brain,gem:Gem,crown:Crown,lock:Lock,key:Key,circle:Circle,triangle:Triangle,hexagon:Hexagon,layers:Layers,users:Users,user:User,skull:Skull,leaf:Leaf,feather:Feather,radio:Radio,"scan-eye":ScanEye,sparkle:Sparkle,"shield-alert":ShieldAlert,"circle-off":CircleOff,minus:Minus,plus:Plus,percent:Percent,"trending-up":TrendingUp,"trending-down":TrendingDown,"arrow-up":ArrowUp,"arrow-down":ArrowDown,"arrow-right":ArrowRight,"arrow-left":ArrowLeft,aperture:Aperture,focus:Focus,"scan-line":ScanLine,"scan-face":ScanFace,"scan-heart":ScanHeart,"scan-search":ScanSearch,"scan-text":ScanText,"scan-barcode":ScanBarcode,"panels-left-right":PanelsLeftRight,"panel-top":PanelTop,"panel-bottom":PanelBottom,"panel-left":PanelLeft,"panel-right":PanelRight} as const;
const iconNames: string[] = Object.keys(effectIconMap);
const availableIconNames = new Set<string>(Object.keys(dynamicIconImports));
const lazyIconCache = new Map<string, ComponentType<any>>();
function getLazyIcon(name: string): ComponentType<any> {
  const cached = lazyIconCache.get(name);
  if (cached) return cached;
  const importer = dynamicIconImports[name as keyof typeof dynamicIconImports];
  const Icon = lazy(importer as () => Promise<{default: ComponentType<any>}>);
  lazyIconCache.set(name, Icon);
  return Icon;
}
function DynamicIcon({name,size=24,...props}:{name:string;size?:number;strokeWidth?:number; color?:string;"aria-hidden"?:boolean}) { const Icon = effectIconMap[name as keyof typeof effectIconMap]; if (Icon) return <Icon size={size} {...props}/>; if (!availableIconNames.has(name)) return <Sparkles size={size} {...props}/>; const LazyIcon = getLazyIcon(name); return <Suspense fallback={<Sparkles size={size} {...props}/>}><LazyIcon size={size} {...props}/></Suspense>; }

type ElementColor = {key:string;color:string};
let cachedColors:ElementColor[]|null=null;
let colorsPromise:Promise<ElementColor[]>|null=null;
function loadColors():Promise<ElementColor[]> {
 if(cachedColors)return Promise.resolve(cachedColors);
 if(!colorsPromise)colorsPromise=fetch("/api/elements").then(r=>r.ok?r.json():{elements:[]}).then(data=>{
  cachedColors=(Array.isArray(data.elements)?data.elements:[]).filter((e:ElementColor)=>typeof e.key==="string"&&/^#[0-9a-fA-F]{6}$/.test(e.color));
  return cachedColors!;
 }).catch(()=>{colorsPromise=null;return []});
 return colorsPromise;
}
const frames = { OFFENSIVE: Spade, PASSIVE: Badge, UTILITY: Scan, SUPPORT: Heart, BASIC: Diamond } as const;
const mirrorIcons: Record<string,string> = { SUMMON_MIRROR: "panels-top-left", MIRROR_RAY: "zap", MAGIC_REFLECTION: "refresh-ccw" };
export function SkillEmblem({ category, effects, icons, size = 64 }: { category: string; effects: Array<{type:string;target?:string;element?:string|null}>; icons?: Record<string,string>; size?:number }) {
 const [palette,setPalette]=useState<ElementColor[]>(cachedColors??[]);
 const gradientId=useId().replace(/:/g,"");
 useEffect(()=>{let mounted=true;loadColors().then(colors=>{if(mounted)setPalette(colors)});return()=>{mounted=false}},[]);
 const colorByKey=new Map(palette.map(e=>[e.key,e.color]));
 const uniqueColors=Array.from(new Set(effects.map(e=>colorByKey.get(String(e.element??""))).filter((c):c is string=>!!c)));
 const frameColor=uniqueColors.length===1?uniqueColors[0]:uniqueColors.length>1?`url(#${gradientId})`:undefined;
 const Frame = frames[category as keyof typeof frames] ?? Scan;
 const selected = effects.slice(0,4);
 const positions = selected.length === 1 ? [[24,24]] : selected.length === 2 ? [[15,24],[33,24]] : selected.length === 3 ? (category === "OFFENSIVE" ? [[24,15],[15,33],[33,33]] : [[15,15],[33,15],[24,33]]) : [[15,15],[33,15],[15,33],[33,33]];
 return <div className="relative shrink-0" style={{width:size,height:size}} aria-label={`Emblema de habilidad con ${effects.length} efectos`} role="img">
  {uniqueColors.length>1&&<svg aria-hidden="true" width="0" height="0" className="absolute"><defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">{uniqueColors.map((color,i)=><stop key={color} offset={`${i/(uniqueColors.length-1)*100}%`} stopColor={color}/>)}</linearGradient></defs></svg>}
  <Frame size={size} strokeWidth={1.5} color={frameColor} className="absolute inset-0" aria-hidden="true" />
  {selected.map((effect,i)=>{
   const candidate = icons?.[effect.type] ?? mirrorIcons[effect.type] ?? (effect.type === "DAMAGE_MULTIPLIER" ? "swords" : "sparkles");
   const name = candidate as string;
   return <div key={i} className="absolute" style={{left:`${positions[i][0]/48*100}%`,top:`${positions[i][1]/48*100}%`,transform:"translate(-50%,-50%)"}}><DynamicIcon name={name} size={size*.19} color={colorByKey.get(String(effect.element??""))} strokeWidth={2} aria-hidden={true} /></div>;
  })}
 </div>;
}
