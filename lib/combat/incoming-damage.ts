import type {CombatLog,Side} from "./turn-engine.ts";

/** A durable summary of actual HP damage dealt by the opposing fighter.
 * RESOLVE events already include simultaneous counterstrikes, which do not
 * create a separate pending reaction for their target. */
export type IncomingDamageSummary={
 hitCount:number;
 totalDamage:number;
 latest:{tick:number;damage:number;summary:string;simultaneous:boolean};
};

export function summarizeIncomingDamage(
 log:readonly CombatLog[], side:Side
):IncomingDamageSummary|null {
 const opponent:Side=side==="PLAYER"?"NPC":"PLAYER";
 let hitCount=0,totalDamage=0;
 let latest:IncomingDamageSummary["latest"]|null=null;
 for(const entry of log){
  if(entry.kind!=="RESOLVE"||entry.by!==opponent||entry.against!==side||
     !Number.isFinite(entry.damage)||(entry.damage??0)<=0)continue;
  const damage=entry.damage!;
  hitCount++;
  totalDamage+=damage;
  latest={
   tick:entry.tick,damage,summary:entry.summary,
   // Older encounters only persisted the human-readable prefix.
   simultaneous:entry.simultaneousCounter===true||
     entry.summary.startsWith("Intercambio simultáneo:")
  };
 }
 return latest?{hitCount,totalDamage,latest}:null;
}
