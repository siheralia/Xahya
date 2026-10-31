"use client";
import { Badge, Diamond, Heart, Scan, Spade, Sparkles, Zap, RefreshCcw, PanelsTopLeft, Swords, Shield, Flame, Snowflake, Wind, Droplets, Sun, Moon, Star, Eye, Target, Sword, WandSparkles, CircleHelp, Activity, HeartPulse, Cross, Hand, Clock, Timer, Gauge, Footprints, Move, Waves, Bolt, CircleDot, Orbit, Ghost, ShieldCheck, ShieldPlus, ArrowLeftRight, Repeat, RotateCcw, BookOpen, Brain, Gem, Crown, Lock, Key, Circle, Triangle, Hexagon, Layers, Users, User, Skull, Leaf, Feather, Radio, ScanEye, Sparkle, ShieldAlert, CircleOff, Minus, Plus, Percent, TrendingUp, TrendingDown, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Aperture, Focus, ScanLine, ScanFace, ScanHeart, ScanSearch, ScanText, ScanBarcode, PanelsLeftRight, PanelTop, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
const effectIconMap = {sparkles:Sparkles,zap:Zap,"refresh-ccw":RefreshCcw,"panels-top-left":PanelsTopLeft,swords:Swords,shield:Shield,flame:Flame,snowflake:Snowflake,wind:Wind,droplets:Droplets,sun:Sun,moon:Moon,star:Star,eye:Eye,target:Target,sword:Sword,"wand-sparkles":WandSparkles,"circle-help":CircleHelp,activity:Activity,"heart-pulse":HeartPulse,cross:Cross,hand:Hand,clock:Clock,timer:Timer,gauge:Gauge,footprints:Footprints,move:Move,waves:Waves,bolt:Bolt,"circle-dot":CircleDot,orbit:Orbit,ghost:Ghost,"shield-check":ShieldCheck,"shield-plus":ShieldPlus,"arrow-left-right":ArrowLeftRight,repeat:Repeat,"rotate-ccw":RotateCcw,"book-open":BookOpen,brain:Brain,gem:Gem,crown:Crown,lock:Lock,key:Key,circle:Circle,triangle:Triangle,hexagon:Hexagon,layers:Layers,users:Users,user:User,skull:Skull,leaf:Leaf,feather:Feather,radio:Radio,"scan-eye":ScanEye,sparkle:Sparkle,"shield-alert":ShieldAlert,"circle-off":CircleOff,minus:Minus,plus:Plus,percent:Percent,"trending-up":TrendingUp,"trending-down":TrendingDown,"arrow-up":ArrowUp,"arrow-down":ArrowDown,"arrow-right":ArrowRight,"arrow-left":ArrowLeft,aperture:Aperture,focus:Focus,"scan-line":ScanLine,"scan-face":ScanFace,"scan-heart":ScanHeart,"scan-search":ScanSearch,"scan-text":ScanText,"scan-barcode":ScanBarcode,"panels-left-right":PanelsLeftRight,"panel-top":PanelTop,"panel-bottom":PanelBottom,"panel-left":PanelLeft,"panel-right":PanelRight} as const;
const iconNames: string[] = Object.keys(effectIconMap);
function DynamicIcon({name,size=24,...props}:{name:string;size?:number;strokeWidth?:number;"aria-hidden"?:boolean}) { const Icon = effectIconMap[name as keyof typeof effectIconMap] ?? Sparkles; return <Icon size={size} {...props}/>; }

const frames = { OFFENSIVE: Spade, PASSIVE: Badge, UTILITY: Scan, SUPPORT: Heart, BASIC: Diamond } as const;
const mirrorIcons: Record<string,string> = { SUMMON_MIRROR: "panels-top-left", MIRROR_RAY: "zap", MAGIC_REFLECTION: "refresh-ccw" };
export function SkillEmblem({ category, effects, icons, size = 64 }: { category: string; effects: Array<{type:string;target?:string}>; icons?: Record<string,string>; size?:number }) {
 const Frame = frames[category as keyof typeof frames] ?? Scan;
 const selected = effects.slice(0,4);
 const positions = selected.length === 1 ? [[24,24]] : selected.length === 2 ? [[15,24],[33,24]] : selected.length === 3 ? (category === "OFFENSIVE" ? [[24,15],[15,33],[33,33]] : [[15,15],[33,15],[24,33]]) : [[15,15],[33,15],[15,33],[33,33]];
 return <div className="relative shrink-0" style={{width:size,height:size}} aria-label={`Emblema de habilidad con ${effects.length} efectos`} role="img">
  <Frame size={size} strokeWidth={1.5} className="absolute inset-0" aria-hidden="true" />
  {selected.map((effect,i)=>{
   const candidate = icons?.[effect.type] ?? mirrorIcons[effect.type] ?? (effect.type === "DAMAGE_MULTIPLIER" ? "swords" : "sparkles");
   const name = (iconNames.includes(candidate as string) ? candidate : "sparkles") as string;
   return <div key={i} className="absolute" style={{left:`${positions[i][0]/48*100}%`,top:`${positions[i][1]/48*100}%`,transform:"translate(-50%,-50%)"}}><DynamicIcon name={name} size={size*.19} strokeWidth={2} aria-hidden={true} /></div>;
  })}
 </div>;
}
