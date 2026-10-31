"use client";
import { Badge, Diamond, Heart, Scan, Spade } from "lucide-react";
import { icons, type LucideIcon, type LucideProps } from "lucide-react";
const iconNames = Object.keys(icons).map(key => key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase());
function DynamicIcon({ name, size = 24, ...props }: { name: string; size?: number; strokeWidth?: number; "aria-hidden"?: boolean }) { const key = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^./, c => c.toUpperCase()) as keyof typeof icons; const Icon = (icons[key] ?? icons.Sparkles) as LucideIcon; return <Icon size={size} {...(props as LucideProps)} />; }

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
