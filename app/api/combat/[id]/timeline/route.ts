import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {randomInt} from "node:crypto";
import {Temporal} from "@js-temporal/polyfill";
import {db} from "@/lib/db";
import {canApproveCombat} from "@/lib/combat/permissions";
import {combatClientView} from "@/lib/combat/magic-area";
import {combatSnapshotEtag,combatEtagMatches} from "@/lib/combat/poll-cache";
import {publicTimelineSessionStatus,type TimelineDeclarationSession}
 from "@/lib/combat/timeline-declarations";
import {submitExperimentalTimelineCommand} from "@/lib/combat/timeline-experiment";
import type {CombatState} from "@/lib/combat/turn-engine";

type SavedV2={version:2;clock:TimelineDeclarationSession["clock"];
 declarations:TimelineDeclarationSession["declarations"];
 receipts:TimelineDeclarationSession["receipts"];
 chargedReactionIds?:string[];usedCounterReactionIds?:string[];
 usedDodgeMovementIds?:string[]};
const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
 critical:randomInt(1_000_000)/1_000_000,
 defense:randomInt(1_000_000)/1_000_000});
const error=(message:string,status=400)=>
 NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
async function access(id:string){
 const {userId}=await auth();
 if(!userId)return null;
 const value=Number(id);
 if(!Number.isSafeInteger(value)||value<1)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 if(!user)return null;
 const Session=(db.orm.public as any).CombatSession;
 const session=await Session.where({id:value}).first();
 if(!session)return null;
 const player=await db.orm.public.Character.where({
   id:Number(session.playerCharacterId)}).first();
 const gm=await canApproveCombat(user);
 if(!player||!gm&&Number(player.userId)!==Number(user.id))
   return null;
 return {session,sessionId:value,user,gm};
}
function read(saved:any):{combat:CombatState;timeline:TimelineDeclarationSession}{
 const combat=saved?.combatV1 as CombatState|undefined;
 const timeline=saved?.combatV2 as SavedV2|undefined;
 if(!combat||combat.version!==1||combat.timelineMode!=="SHARED"||
    !timeline||timeline.version!==2||!timeline.clock||
    combat.tick!==timeline.clock.nowTick||
    combat.actors.NPC.characterId!==null)
   throw new Error("El encuentro no tiene una sesión V2 experimental válida.");
 return {combat,timeline};
}
function publicPayload(combat:CombatState,timeline:TimelineDeclarationSession){
 // Frozen shooter and target/aim remain private, like uncommitted commands.
 const projected=combatClientView(combat);
 const {timelineProjectiles:privateProjectiles,...state}=projected;
 const flying=(privateProjectiles??[]).map(({id,owner,launchTick,impactTick})=>
   ({id,owner,launchTick,impactTick}));
 return {mode:"EXPERIMENTAL_V2" as const,state,
   projectiles:flying,timeline:publicTimelineSessionStatus(timeline),
   limitations:"Laboratorio: golpes, guardias, movimiento y magia básica. Sin pasivas modulares ni gasto de inventario real."};
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const accessInfo=await access((await params).id);
 if(!accessInfo)return error("Combate no encontrado o sin autorización.",403);
 let payload;
 try{
   const saved=accessInfo.session.lastAction as any;
   const {combat,timeline}=read(saved);
   payload=publicPayload(combat,timeline);
 }catch{return error("Este combate no utiliza el laboratorio V2.",409);}
 const text=JSON.stringify(payload);
 const etag=combatSnapshotEtag(text);
 const headers={"ETag":etag,"Cache-Control":"private, no-store","Vary":"Cookie"};
 if(combatEtagMatches(req.headers.get("if-none-match"),etag))
   return new NextResponse(null,{status:304,headers});
 return new NextResponse(text,{status:200,
   headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const accessInfo=await access((await params).id);
 if(!accessInfo)return error("Combate no encontrado o sin autorización.",403);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")
   return error("Debes indicar una acción y su identificador.");
 try{
   const committed=await db.transaction(async tx=>{
     // One row lock covers: V2 receipts, PA budgets, NPC decisions,
     // projectile queue, HP/equipment damage and the session clock.
     const lock=db.raw.sql`UPDATE public."combatSession" SET id=id
       WHERE id=${accessInfo.sessionId}`.affectedCount().build();
     if((await tx.execute(lock)).affectedRows!==1)
       throw new Error("El encuentro ya no existe.");
     const Session=(tx.orm.public as any).CombatSession;
     const fresh=await Session.where({id:accessInfo.sessionId}).first();
     const character=await tx.orm.public.Character.where({
       id:Number(fresh?.playerCharacterId??0)}).first();
     if(!fresh||!character||
       !accessInfo.gm&&Number(character.userId)!==Number(accessInfo.user.id))
       throw new Error("No tienes autorización sobre este encuentro.");
     const original=read(fresh.lastAction);
     if(original.combat.status!=="ACTIVE"||String(fresh.status)!=="ACTIVE")
       throw new Error("El combate experimental ya terminó.");
     const result=await submitExperimentalTimelineCommand(
       original.combat,original.timeline,body.command,
       String(body.requestId??""),dice);
     if(!result.replayed){
       await Session.where({id:accessInfo.sessionId}).update({
         lastAction:{combatV1:result.combat,combatV2:result.timeline},
         currentTick:result.combat.tick,turn:result.combat.round,
         status:result.combat.status,
         activeActor:result.combat.status==="ACTIVE"?"PLAYER":"FINISHED",
         playerNextActionTick:result.timeline.clock.actors.PLAYER.availableAtTick,
         npcNextActionTick:result.timeline.clock.actors.NPC.availableAtTick,
         updatedAt:Temporal.Now.instant(),
       });
     }
     return {...publicPayload(result.combat,result.timeline),
       replayed:result.replayed,batches:result.batches};
   });
   return NextResponse.json(committed,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
   return error(e instanceof Error?e.message:"No se pudo ejecutar la orden V2.");
 }
}
