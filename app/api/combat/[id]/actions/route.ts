import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { combatSnapshotEtag, combatEtagMatches } from "@/lib/combat/poll-cache";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import {
  applyCombatCommand, applyResolvedCombatSkill, applyResolvedCombatConsumable, applyResolvedKarmaBoost, progressAutonomousSummons, hasActiveBlockGuard, canAct, type CombatCommand, type CombatState, type Side,
} from "@/lib/combat/turn-engine";
import { advanceCombatMechanics } from "@/lib/skills/mechanics-runtime";
import { isReplayableCombatKind,isCombatActionReplay,recordCombatAction,
  type ReplayableCombatCommand } from "@/lib/combat/action-idempotency";
import { progressTrainingNpc } from "@/lib/combat/npc-policy";
import { combatClientView } from "@/lib/combat/magic-area";
import { canApproveCombat } from "@/lib/combat/permissions";
import { compileCombatSkill } from "@/lib/combat/skill-casting";
import {readModularCutover} from "@/lib/effects/modular-cutover-registry";
import {attachedCreationPassive} from "@/lib/combat/constructs";
import {validateKarmaBoostAllocation} from "@/lib/combat/karma-boost";
import {getEffectiveCombatCharacterStats} from "@/lib/stats/effective";
import {calculateConfiguredDerivedStats} from "@/lib/stats/engine";
import {readStatisticsCatalog,CORE_BASIC_STAT_KEYS} from "@/lib/stats/dynamic";
import {readMechanics} from "@/lib/stats/mechanics";
import { meetsEffectRequirements } from "@/lib/skills/effect-requirements";
import {compileCombatConsumable} from "@/lib/items/combat-consumables";
import {weaponWearSinceSnapshot} from "@/lib/combat/weapon-persistence";

const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
  critical:randomInt(1_000_000)/1_000_000,defense:randomInt(1_000_000)/1_000_000});
/** A still-raised shield handles overlapping blows in the same locked combat
 * transaction, without a second request, AP or reaction ticks. Every impact
 * still gets independent server dice and item wear.
 */
function settleRaisedBlocks(seed:CombatState):CombatState {
 let state=seed;
 for(let i=0;i<12&&state.pending&&hasActiveBlockGuard(state,state.pending.against);i++){
   const defender=state.pending.against;
   state=applyCombatCommand(state,defender,{kind:"DEFEND",defense:"BLOCK"},dice());
   if(state.status==="ACTIVE"&&defender==="PLAYER"&&state.actors.NPC.characterId===null)
     state=progressTrainingNpc(state,dice,()=>randomInt(1_000_000)/1_000_000);
 }
 return state;
}
async function access(id:string) {
  const {userId}=await auth();
  if(!userId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const encounterId=Number(id);
  if(!user||!Number.isSafeInteger(encounterId)||encounterId<1)return null;
  const Session=(db.orm.public as any).CombatSession;
  const session=await Session.where({id:encounterId}).first();
  if(!session)return null;
  const state=(session.lastAction as any)?.combatV1 as CombatState|undefined;
  if(!state||state.version!==1)return null;
  const player=await db.orm.public.Character.where({id:Number(session.playerCharacterId)}).first();
  const gm=await canApproveCombat(user);
  const opponentId=Number(state.actors.NPC.characterId??0);
  const opponent=opponentId?await db.orm.public.Character.where({id:opponentId}).first():null;
  const canPlayer=gm||Number(player?.userId)===Number(user.id);
  const canOpponent=gm||(opponent!==null&&Number(opponent.userId)===Number(user.id));
  if(!canPlayer&&!canOpponent)return null;
  return {user,session,gm,canPlayer,canOpponent,state,encounterId};
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const a=await access((await params).id);
  if(!a)return NextResponse.json({error:"Combate no encontrado o sin permiso."},{status:403});
  const resource=(db.orm.public as any).CharacterResource;
  const karma:Partial<Record<Side,number>>={};
  for(const side of ["PLAYER","NPC"] as const){
    if(!(side==="PLAYER"?a.canPlayer:a.canOpponent))continue;
    const characterId=a.state.actors[side].characterId;
    if(characterId===null)continue;
    const row=await resource.where({characterId}).first();
    karma[side]=Number(row?.karma??0);
  }
  const catalog=await readStatisticsCatalog();
  const basic=new Map([...CORE_BASIC_STAT_KEYS].map(key=>[key,{key,label:key}]));
  for(const item of catalog){
    if(item.kind==="basic"&&item.active!==false)basic.set(item.key,{key:item.key,label:item.name||item.key});
    else if(item.kind==="basic"&&item.active===false)basic.delete(item.key);
  }
  const payload={state:combatClientView(a.state),karma,boostStats:[...basic.values()],
    permissions:{PLAYER:a.canPlayer,NPC:a.canOpponent},
    canMove:{PLAYER:canAct(a.state,"PLAYER"),NPC:canAct(a.state,"NPC")}};
  const serialized=JSON.stringify(payload);
  const etag=combatSnapshotEtag(serialized);
  const headers={"ETag":etag,"Cache-Control":"private, no-store","Vary":"Cookie"};
  // 304 has no response body: the browser retains its already rendered snapshot.
  if(combatEtagMatches(req.headers.get("if-none-match"),etag))
    return new NextResponse(null,{status:304,headers});
  return new NextResponse(serialized,{status:200,
    headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  const a=await access((await params).id);
  if(!a)return NextResponse.json({error:"Combate no encontrado o sin permiso."},{status:403});
  const body=await req.json().catch(()=>null);
  const side=body?.side as Side;
  if(!["PLAYER","NPC"].includes(side)||!body?.command||typeof body.command!=="object")
    return NextResponse.json({error:"Acción inválida."},{status:400});
  if(side==="PLAYER"&&!a.canPlayer || side==="NPC"&&!a.canOpponent)
    return NextResponse.json({error:"No controlas a este combatiente."},{status:403});
  const advanceNpcOnly=body.command.kind==="ADVANCE";
  const command=body.command as CombatCommand;
  const replayAction=isReplayableCombatKind(command.kind)
    ?command as ReplayableCombatCommand:null;
  try {
    const result=await db.transaction(async tx=>{
      // Serialize both players and NPC replies to prevent lost update/double spending.
      const lock=db.raw.sql`UPDATE public."combatSession" SET id=id WHERE id=${a.encounterId}`.affectedCount().build();
      if((await tx.execute(lock)).affectedRows!==1)throw new Error("COMBAT_NOT_FOUND");
      const Session=(tx.orm.public as any).CombatSession;
      const fresh=await Session.where({id:a.encounterId}).first();
      const state=(fresh?.lastAction as any)?.combatV1 as CombatState|undefined;
      if(!state||state.version!==1)
        throw new Error("Este encuentro no admite estas acciones.");
      // Inside the session row lock: distinguish retries from new actions
      // BEFORE checking FINISHED, spending resources or advancing the NPC.
      if(replayAction&&isCombatActionReplay(state,side,replayAction))
        return state;
      if(String(fresh?.status)!=="ACTIVE")
        throw new Error("El combate ya terminó o no admite estas acciones.");
      let next: CombatState;
      if(advanceNpcOnly) {
        if(side!=="PLAYER" || state.actors.NPC.characterId!==null)
          throw new Error("Solo puedes avanzar la IA de un oponente de entrenamiento.");
        next=progressTrainingNpc(state,dice,()=>randomInt(1_000_000)/1_000_000);
        if(JSON.stringify(next)===JSON.stringify(state))
          throw new Error("No hay ninguna acción automática pendiente del NPC.");
      } else if(command.kind==="BOOST_KARMA"){
        const characterId=state.actors[side].characterId;
        if(characterId===null)throw new Error("Los NPC de entrenamiento no tienen karma.");
        const requestId=String(command.requestId??"");
        if(state.processedKarmaRequests?.includes(requestId)) {
          next=state; // Idempotent retry: never debit the real wallet twice.
        } else {
          const catalog=await readStatisticsCatalog(tx);
          const allowed=new Set([...CORE_BASIC_STAT_KEYS].filter(key=>!catalog.some(entry=>entry.key===key&&entry.active===false)));
          for(const entry of catalog)if(entry.kind==="basic"&&entry.active!==false)allowed.add(entry.key);
          const {allocation,cost}=validateKarmaBoostAllocation(command.allocation,allowed);
          const calculated=await getEffectiveCombatCharacterStats(characterId,tx);
          if(!calculated)throw new Error("No hay estadísticas para aumentar.");
          const prior=state.karmaBoosts?.[side]??{};
          const beforeBase={...calculated.effectiveStats};
          for(const [key,value] of Object.entries(prior))beforeBase[key]=(beforeBase[key]??0)+value;
          const afterBase={...beforeBase};
          for(const [key,value] of Object.entries(allocation))afterBase[key]=(afterBase[key]??0)+value;
          const [before,after,settings]=await Promise.all([
            calculateConfiguredDerivedStats(beforeBase as any,tx),
            calculateConfiguredDerivedStats(afterBase as any,tx),
            readMechanics(tx),
          ]);
          // Scale reactive karma deltas with already-active passive multipliers,
          // without granting flat passives repeatedly on each boost.
          const derivedScale=(key:string)=>{
            const factor=calculated.derivedStatMultipliers[key]??1;
            return Number.isFinite(factor)?factor:1;
          };
          const deltas:Record<string,number>={};
          for(const key of ["strength","agility","constitution","luck"]){
            const diff=(afterBase[key]??0)-(beforeBase[key]??0);
            if(diff)deltas[key]=diff;
          }
          for(const key of ["physicalAttack","magicAttack","physicalDefense","magicDefense",
            "precision","dodge","critical","race","maxHp"]){
            const delta=(Number(after[key]??0)-Number(before[key]??0))*derivedScale(key);
            if(!Number.isFinite(delta))throw new Error("La estadística derivada no es válida: "+key);
            if(delta)deltas[key]=delta;
          }
          const maxManaDelta=(Number(after.maxMana??0)-Number(before.maxMana??0))*derivedScale("maxMana");
          if(!Number.isFinite(maxManaDelta))throw new Error("Maná derivado inválido.");
          if(maxManaDelta)deltas.manaMax=maxManaDelta;
          const speedKey=settings.combatSpeed;
          const oldSpeed=beforeBase[speedKey]??before[speedKey];
          const newSpeed=afterBase[speedKey]??after[speedKey];
          if(Number.isFinite(oldSpeed)&&Number.isFinite(newSpeed)&&newSpeed!==oldSpeed)
            deltas.speedValue=(newSpeed-oldSpeed)*(speedKey in beforeBase?1:derivedScale(speedKey));
          const request=db.raw.sql`UPDATE public."characterResource"
             SET karma=karma-${cost} WHERE "characterId"=${characterId} AND karma>=${cost}`
             .affectedCount().build();
          if((await tx.execute(request)).affectedRows!==1)
            throw new Error("Karma insuficiente: se necesitan "+cost+" puntos.");
          next=applyResolvedKarmaBoost(state,side,requestId,allocation,cost,deltas);
          if(side==="PLAYER"&&next.status==="ACTIVE")
            next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
        }
       } else if(command.kind==="USE_ITEM") {
         const itemId=Number(command.itemId),requestId=String(command.requestId??"");
         if(!Number.isSafeInteger(itemId)||itemId<1)
           throw new Error("Consumible inválido.");
         if(state.processedItemRequests?.includes(requestId)){
           next=state; // Retry never consumes two units or advances the NPC.
         }else{
           const characterItemId=command.characterItemId;
           if(characterItemId!==undefined&&(!Number.isSafeInteger(characterItemId)||characterItemId<1))
             throw new Error("Instancia del consumible inválida.");
           const stock=(state.consumables?.[side]??[]).find(entry=>
             entry.itemId===itemId&&entry.quantity>0&&
             (characterItemId===undefined||entry.characterItemId===characterItemId));
           if(!stock)throw new Error("Este consumible ya no está disponible.");
           const Item=(tx.orm.public as any).Item;
           const row=await Item.where({id:itemId}).first();
           const recipe=row?compileCombatConsumable(row):null;
           if(!recipe||recipe.action!==stock.action||recipe.amount!==stock.amount)
             throw new Error("La definición del consumible ha cambiado. Inicia un nuevo encuentro.");
           // Pure resolution validates initiative, stock and recovery caps.
           next=applyResolvedCombatConsumable(state,side,stock,requestId);
           const characterId=state.actors[side].characterId;
           if(characterId!==null){
             if(!stock.characterItemId)throw new Error("Consumible sin vínculo al inventario.");
             const consume=db.raw.sql`
               UPDATE public."characterItem" SET quantity=quantity-1
               WHERE id=${stock.characterItemId} AND "characterId"=${characterId}
                 AND "itemId"=${itemId} AND quantity>0
             `.affectedCount().build();
             if((await tx.execute(consume)).affectedRows!==1)
               throw new Error("No quedan unidades de esa poción en tu inventario real.");
             await (tx.orm.public as any).CharacterItem.where({id:stock.characterItemId,quantity:0}).delete();
           }
           if(side==="PLAYER"&&next.status==="ACTIVE")
             next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
         }
       } else if(command.kind==="CAST_SKILL") {
        // The client supplies ONLY a skill id and aim. Its effects, cost and
        // cooldown are compiled exclusively from the approved DB row here,
        // inside the same serialized session transaction.
        const characterId=state.actors[side].characterId;
        if(characterId===null)throw new Error("El NPC de entrenamiento no posee habilidades personales.");
        const skillId=Number(command.skillId);
        if(!Number.isSafeInteger(skillId)||skillId<=0)throw new Error("Habilidad inválida.");
        const requestId=String(command.requestId??"");
        if(state.processedSkillRequests?.includes(requestId)){
          next=state; // Same request retransmitted: no extra mana, PA or NPC action.
        }else{
          const Skill=(tx.orm.public as any).Skill;
          const skill=await Skill.where({id:skillId,characterId,status:"APPROVED"}).first();
          if(!skill)throw new Error("Esta habilidad no está aprobada para tu personaje.");
          const stolenQuery=db.raw.sql`
            SELECT "sourceSkillId" AS "id" FROM public."skillTheft"
            WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
          `.returnsRow({id:"pg/int4@1"}).build();
          const stolenIds=new Set((await db.runtime().query(stolenQuery) as Array<{id:number}>)
            .map(row=>Number(row.id)));
          if(stolenIds.has(skillId))
            throw new Error("No puedes lanzar una habilidad que te han robado temporalmente.");
          const available=await Skill.where({characterId,status:"APPROVED"}).all();
          // A temporarily stolen prerequisite cannot authorize another skill.
          const others=available.filter((s:any)=>Number(s.id)!==skillId && !stolenIds.has(Number(s.id)));
          const requirements=Array.isArray(skill.effectRequirements)?skill.effectRequirements:[];
          if(!meetsEffectRequirements(requirements,others))
            throw new Error("No se cumplen los requisitos por efecto de esta habilidad.");
          const {mode}=await readModularCutover();
          const plan=compileCombatSkill(skill,mode);
          // D2.1 already respects explicit deactivation of modular passives.
          // D2.2 casts must honor the same character setting. A missing state
          // row means "not explicitly disabled" for historical characters.
          if(plan.approvedActivation||plan.approvedHostileStatus||plan.approvedHybridContact){
            const SkillState=(tx.orm.public as any).CharacterSkillState;
            const activation=SkillState
              ?await SkillState.where({characterId,skillId}).first():null;
            if(activation?.active===false)
              throw new Error("Esta habilidad modular está desactivada para el personaje.");
          }
          if(plan.requiredParentSkillId && !others.some((related:any)=>
            Number(related.id)===plan.requiredParentSkillId))
            throw new Error("No tienes disponible la habilidad vinculada necesaria para ejecutar esta técnica.");
          if(plan.category==="CONSTRUCTION")plan.creationPassive=attachedCreationPassive(plan.id,available);
          next=applyResolvedCombatSkill(state,side,plan,command,dice());
          if(side==="PLAYER"&&next.status==="ACTIVE")
            next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
        }
      } else {
        next=applyCombatCommand(state,side,command,dice(),undefined,undefined,undefined,false,
          command.kind==="DEFEND"&&command.defense==="COUNTER"?dice():undefined);
        // In particular, progress after PLAYER's DEFEND; previously this was
        // skipped and forced GM to control the training NPC manually.
        if(side==="PLAYER" && next.status==="ACTIVE")
          next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
      }
      // Only new, committed actions advance autonomous creatures. A request
      // replay returns the original state without spawning extra attacks.
      if(next!==state&&next.status==="ACTIVE")
        next=settleRaisedBlocks(next);
      if(next!==state&&next.status==="ACTIVE"&&!next.pending){
        next=progressAutonomousSummons(next,dice());
        if(next.pending?.against==="NPC"&&next.actors.NPC.characterId===null)
          next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
      }
      if(next!==state&&next.status==="ACTIVE")
        next=settleRaisedBlocks(next);
      if(replayAction)
        next=recordCombatAction(state,next,side,replayAction);
      let mechanics=fresh.mechanicsState;
      if(next.round>state.round) {
        const Skill=(tx.orm.public as any).Skill;
        const SkillState=(tx.orm.public as any).CharacterSkillState;
        const approved=Skill?await Skill.where({characterId:Number(fresh.playerCharacterId)}).all():[];
        const active=SkillState?await SkillState.where({characterId:Number(fresh.playerCharacterId),active:true}).all():[];
        mechanics=advanceCombatMechanics(mechanics,Number(fresh.playerCharacterId),
          approved,active.map((x:any)=>Number(x.skillId)));
      }
      // Persist wear on the SAME inventory item copy captured at combat
      // start, even if someone subsequently unequips or moves that copy to
      // another slot outside the encounter. Equipment is an encounter
      // snapshot; the old equipped=true filter silently lost this wear.
      // LEAST also preserves damage already recorded by another encounter.
      for(const who of ["PLAYER","NPC"] as const){
        const fighter=next.actors[who],characterId=fighter.characterId;
        if(characterId===null)continue;
        const previous=state.actors[who];
        const persistedCopies=new Set<number>();
        // A thrown weapon remains the same owned inventory copy while it lies
        // on the field. Persist its physical collision wear even before pickup.
        // At combat completion settleDroppedWeapons returns it to a hand;
        // the per-copy Set prevents a second write when snapshots overlap.
        for(const weapon of [fighter.equippedWeapon,fighter.offhandWeapon,
          ...(fighter.equippedWearables??[]),
          ...(next.droppedWeapons??[]).filter(d=>d.owner===who).map(d=>d.weapon)]){
          if(!weapon?.characterItemId)continue;
          if(persistedCopies.has(weapon.characterItemId))continue;
          persistedCopies.add(weapon.characterItemId);
          const current=weapon.durability??fighter.weaponIntegrity;
          const integrity=Math.max(0,Math.min(100,Math.floor(current)));
          const prior=[previous.equippedWeapon,previous.offhandWeapon,
            ...(previous.equippedWearables??[]),
            ...(state.droppedWeapons??[]).filter(d=>d.owner===who).map(d=>d.weapon)]
            .find(w=>w?.characterItemId===weapon.characterItemId);
          const before=Math.max(0,Math.min(100,Math.floor(
            prior?.durability??integrity)));
          const repaired=next.round>state.round?
            (next.itemRepairsThisRound??[])
              .filter(op=>op.by===who&&op.round===next.round&&
                op.characterItemId===weapon.characterItemId)
              .reduce((sum,op)=>sum+op.restored,0):0;
          // A block and a round-start repair can occur in ONE combat action.
          // Subtract the real wear first, then add only authorized repair.
          const worn=weaponWearSinceSnapshot(before,integrity,repaired);
          if(repaired>0){
            const query=db.raw.sql`
              UPDATE public."characterItem"
              SET durability=GREATEST(0,LEAST(100,
                LEAST(durability,${before})-${worn}+${repaired}))
              WHERE id=${weapon.characterItemId} AND "characterId"=${characterId}
                AND "itemId"=${weapon.itemId??0} AND quantity=1
            `.affectedCount().build();
            if((await tx.execute(query)).affectedRows!==1)
              throw new Error("No se pudo guardar la autorreparación del ejemplar equipado.");
          }else{
            const query=db.raw.sql`
              UPDATE public."characterItem"
                SET durability=LEAST(durability,${integrity})
              WHERE id=${weapon.characterItemId} AND "characterId"=${characterId}
                AND "itemId"=${weapon.itemId??0}
            `.affectedCount().build();
            await tx.execute(query);
          }
        }
      }
      await Session.where({id:a.encounterId}).update({
        lastAction:{combatV1:next},mechanicsState:mechanics,
        currentTick:next.tick,turn:next.round,status:next.status,
        activeActor:next.pending?.against??(canAct(next,"PLAYER")?"PLAYER":"NPC"),
        playerNextActionTick:next.actors.PLAYER.spentTicks,
        npcNextActionTick:next.actors.NPC.spentTicks,
        updatedAt:Temporal.Now.instant(),
      });
      return next;
    });
    return NextResponse.json({state:combatClientView(result)});
  }catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:"No se pudo ejecutar la acción."},{status:400});
  }
}
