import {
  applyCombatCommand, applyResolvedCombatSkill, applyResolvedCombatConsumable, basicCounterAttack, canAct, contestChance, defaultAttackSource, effectiveWeaponReachMeters, matchupMultiplier, physicalAttackStart, remainingAp, turnTicks, weaponForSource,
  type CombatCommand, type CombatState, type DefenseChoice, type Point,
} from "./turn-engine.ts";
import { BASIC_MAGIC_RANGE_METERS } from "./magic-area.ts";
import {fieldDistance,fieldPosition} from "./field-plane.ts";
import {blockingMovement} from "./physical-obstacles.ts";

export type NpcDice = { hit: number; critical: number; defense: number };
export type NpcRandom = () => number;
const cap = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** The training NPC varies the incoming strike orientation, not just its dice.
 * Points remain inside the combat editor's normalized [0,1] arena. */
export function npcAttackTrajectory(random: NpcRandom, anchoredAt?: Point | null): Point[] {
  const angle=cap(random(),0,0.999999)*Math.PI*2;
  const dx=Math.cos(angle)*0.35,dy=Math.sin(angle)*0.35;
  if(anchoredAt) {
    // Do not teleport the NPC's weapon stroke. Keep the inherited starting
    // point exactly, then draw toward a randomized reachable endpoint.
    const toward={x:cap(anchoredAt.x+dx*2,0,1),y:cap(anchoredAt.y+dy*2,0,1)};
    const distance=Math.hypot(toward.x-anchoredAt.x,toward.y-anchoredAt.y);
    const end=distance<0.08
      ? {x:cap(anchoredAt.x-dx*2,0,1),y:cap(anchoredAt.y-dy*2,0,1)}
      : toward;
    return [{...anchoredAt},end];
  }
  return [{x:0.5-dx,y:0.5-dy},{x:0.5+dx,y:0.5+dy}];
}

/** This function only applies to training NPCs: never advance a second human character. */
export function isTrainingNpc(state: CombatState) {
  return state.actors.NPC.characterId === null;
}
function tangentGuardAngle(points: Point[]): number {
  const a = points[points.length - 2] ?? {x:0.1, y:0.5};
  const b = points[points.length - 1] ?? {x:0.9, y:0.5};
  const heading = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return ((Math.round(heading + 90) % 360) + 360) % 360;
}

/**
 * Reaction policy: first reserve an opportunity for a survivable counterattack,
 * then weigh five defenses by estimated effectiveness. This prevents a passive
 * NPC that spends every shared-tick action on defense. Reactions that are used
 * are still fully charged by the combat engine; counterattacks are not free.
 */
export function chooseNpcReaction(state: CombatState, random: NpcRandom): Extract<CombatCommand,{kind:"DEFEND"}> {
  if (state.pending?.against !== "NPC") throw new Error("El NPC no tiene un ataque pendiente.");
  const npc = state.actors.NPC, attacker = state.actors[state.pending.by];
  if (remainingAp(npc) < 1 || npc.spentTicks >= 100) return {kind:"DEFEND",defense:"NONE"};
  // Reserve an actual paid counterturn when defending would exhaust the
  // 100-tick window. This is essential for slow training opponents facing
  // repeated magical/area attacks: they cannot spend every round reacting.
  const roundStart = (state.round-1)*100;
  const attackedThisRound=state.log.some(e=>e.kind==="ATTACK"&&e.by==="NPC"&&e.tick>roundStart);
  const reactionTicks=turnTicks(npc);
  const canCounterNow=npc.spentTicks+reactionTicks<=attacker.spentTicks;
  const canDefendAndCounter=remainingAp(npc)>=2 &&
    npc.spentTicks+reactionTicks*2<=100;
  const factor=matchupMultiplier(state.pending.attackType,npc.defenseType);
  const power=state.pending.usesMagic?attacker.magicAttack:attacker.physicalAttack;
  const protection=state.pending.usesMagic?npc.magicDefense:npc.physicalDefense;
  const worstDirectDamage=Math.max(1,Math.round(power*1.5*factor-protection*0.75));
  // An exchange occurs simultaneously with the incoming attack. It costs
  // the NPC's own PA/ticks but does NOT need to finish before the attacker's
  // initiative clock. Requiring canCounterNow here makes slow NPCs spend
  // their last window only defending and never strike back against fast magic.
  if(!attackedThisRound&&!canDefendAndCounter){
    const preferMagic=random()<0.45;
    const available=basicCounterAttack(state,"NPC",preferMagic);
    if(available){
      // Exchange attacks in the same instant: the NPC still takes the full
      // incoming hit and pays the normal attack's AP, ticks and optional mana.
      // If defeat is inevitable, its already-started blow still resolves.
      return {kind:"DEFEND",defense:"COUNTER",counterMagic:available.usesMagic===true};
    }
  }
  if(state.pending.attackArea?.shape==="SELF_FIELD"){
    // The sweep has no hidden target center; dodge is a normal physical contest.
    const choice=random();
    if(choice<0.5)return {kind:"DEFEND",defense:"DODGE"};
    if(choice<0.85)return {kind:"DEFEND",defense:"ENDURE"};
    return {kind:"DEFEND",defense:"NONE"};
  }
  if (state.pending.usesMagic||state.pending.attackArea) {
    // Never inspect targetCenter: the NPC has only the same four-cell
    // quadrant hint available to a human defender.
    const hint=state.pending.areaHint??"superior izquierda";
    const startX=hint.includes("derecha")?1/3:0;
    const startY=hint.includes("inferior")?1/3:0;
    const choice=random();
    if (choice<0.50) return {kind:"DEFEND",defense:"DODGE",
      predictedCenter:{x:startX+cap(random(),0,0.999999)*2/3,
        y:startY+cap(random(),0,0.999999)*2/3}};
    if (choice<0.85 && state.pending.usesMagic && (state.mana?.NPC?.current??0)>=1) return {kind:"DEFEND",defense:"MAGIC_FIELD"};
    return choice<0.95 ? {kind:"DEFEND",defense:"ENDURE"} : {kind:"DEFEND",defense:"NONE"};
  }
  if (state.pending.rangedPhysical) {
    // The NPC receives the same quadrant hint as a human, never the secret center.
    const hint=state.pending.areaHint??"superior izquierda";
    const guess={x:(hint.includes("derecha")?1/3:0)+cap(random(),0,0.999999)*2/3,
      y:(hint.includes("inferior")?1/3:0)+cap(random(),0,0.999999)*2/3};
    const choice=random();
    if(choice<0.5)return {kind:"DEFEND",defense:"DODGE",predictedCenter:guess};
    if(choice<0.75)return {kind:"DEFEND",defense:"DEFLECT",defenseAngle:90,predictedCenter:guess};
    return choice<0.9?{kind:"DEFEND",defense:"BLOCK"}:{kind:"DEFEND",defense:"ENDURE"};
  }
  // Physical attacks share the budget check above; reaction types below are
  // weighted only when they leave a viable counterturn or prevent a lethal hit.
  if(state.trainingNpc?.difficulty==="AGGRESSIVE"&&canCounterNow&&
    npc.hp>2*worstDirectDamage&&random()<0.45){
    const plan=basicCounterAttack(state,"NPC",false);
    if(plan)return {kind:"DEFEND",defense:"COUNTER",counterMagic:plan.usesMagic===true};
  }
  const dodgeChance = 1 - contestChance(attacker.precision,npc.dodge);
  const blockChance = contestChance(npc.constitution * factor,attacker.strength);
  const endureChance = contestChance(npc.constitution,attacker.strength);
  const repelChance = contestChance(npc.strength,attacker.strength);
  const deflectChance = contestChance(npc.agility*1.5,attacker.strength);
  const severe = npc.hp / npc.maxHp < 0.25;
  const choices: Array<{defense:DefenseChoice; weight:number}> = [
    {defense:"DODGE",weight:1+3*dodgeChance+(severe?0.5:0)},
    {defense:"BLOCK",weight:npc.weaponIntegrity>0 ? 0.8+3*blockChance*(0.5+npc.weaponIntegrity/200) : 0},
    {defense:"ENDURE",weight:0.5+2*endureChance},
    {defense:"REPEL",weight:0.5+2.4*repelChance},
    {defense:"DEFLECT",weight:0.8+3*deflectChance},
  ];
  const total=choices.reduce((sum,c)=>sum+c.weight,0);
  let ticket=cap(random(),0,0.999999)*total;
  for(const choice of choices) {
    ticket-=choice.weight;
    if(ticket<0)return choice.defense==="DEFLECT"
      ? {kind:"DEFEND",defense:"DEFLECT",defenseAngle:tangentGuardAngle(state.pending.trajectory)}
      : {kind:"DEFEND",defense:choice.defense};
  }
  return {kind:"DEFEND",defense:"DODGE"};
}

/**
 * Runs only until the human character has a meaningful decision again:
 * - automatically answers attacks directed at an NPC,
 * - allows the NPC to spend available ticks when its time slot arrives,
 * - stops immediately when the NPC attacks so the human can pick a defense,
 * - advances after a PLAYER defense, WAIT or an exhausted PLAYER budget.
 *
 * Never ask the human to switch to controlling the training NPC to unblock it.
 */
export function progressTrainingNpc(
  state: CombatState, makeDice: () => NpcDice, random: NpcRandom,
): CombatState {
  if (!isTrainingNpc(state) || state.status !== "ACTIVE") return state;
  let next=state;
  for(let i=0;i<100;i++) {
    if(next.status!=="ACTIVE")return next;
    if(next.pending) {
      if(next.pending.against==="PLAYER")return next;
      const reaction=chooseNpcReaction(next,random);
      next=applyCombatCommand(next,"NPC",reaction,makeDice(),undefined,undefined,undefined,false,
        reaction.defense==="COUNTER"?makeDice():undefined);
      continue;
    }
    if(!canAct(next,"NPC"))return next;
    const npc=next.actors.NPC, player=next.actors.PLAYER;
    const playerReady=canAct(next,"PLAYER");
    // The NPC reaches the next action slot once enough time has elapsed
    // on the shared 100-tick timeline. If PLAYER cannot act, run the NPC now.
    const npcSlotReady = npc.spentTicks + turnTicks(npc) <= player.spentTicks;
    if(playerReady&&!npcSlotReady)return next;
    const distance=fieldDistance(npc,player);
    const profile=next.trainingNpc?.difficulty??"INTERMEDIATE";
    // A training NPC may use each free potion at a random useful opportunity.
    const availablePotions=(next.consumables?.NPC??[]).filter(p=>p.quantity>0&&
      (p.action==="HEAL_HP"?npc.maxHp>npc.hp:npc.magicAttack>0&&
       (next.mana?.NPC?.current??0)<(next.mana?.NPC?.max??0)));
    if(availablePotions.length&&random()<0.32){
      const chosen=availablePotions[Math.min(availablePotions.length-1,
       Math.floor(cap(random(),0,0.999999)*availablePotions.length))];
      next=applyResolvedCombatConsumable(next,"NPC",chosen,
        "npc-potion-"+next.round+"-"+npc.spentTicks+"-"+chosen.itemId);
      continue;
    }
    const skillChance=profile==="AGGRESSIVE"?0.75:profile==="ADVANCED"?0.48:profile==="ENDURANCE"?0.35:profile==="BASIC"?0.12:0.25;
    // Skills are compiled from the published catalog at encounter creation.
    // Reuse the same engine, paid PA/ticks, encounter mana and cooldowns.
    const options=(next.trainingNpc?.skills??[]).filter(plan=>{
      if((next.mana?.NPC?.current??0)<plan.cost)return false;
      const ready=next.skillCooldowns?.NPC?.[String(plan.id)]??0;
      if(ready===-1||ready>next.round)return false;
      if(plan.category==="SUPPORT")return (plan.healing>0&&npc.hp<npc.maxHp*0.70)
        ||(plan.bonuses.length>0&&!next.skillBonuses?.some(b=>b.by==="NPC"&&b.skillId===plan.id));
      return plan.category==="OFFENSE"&&plan.rangeMeters>0&&distance<=plan.rangeMeters;
    });
    if(options.length&&random()<skillChance) {
      // Aggressive opponents favor offensive actions; wounded opponents can still heal.
      const offensive=options.filter(p=>p.category==="OFFENSE");
      const selected=profile==="AGGRESSIVE"&&offensive.length?offensive:options;
      const plan=selected[Math.min(selected.length-1,Math.floor(cap(random(),0,0.999999)*selected.length))];
      const source=defaultAttackSource(npc);
      const aim=plan.category==="OFFENSE"
        ?plan.attackArea?.shape==="SELF_FIELD"?{}
         :plan.usesMagic||plan.attackArea
          ?{areaCenter:{x:0.4+0.2*cap(random(),0,0.999999),y:0.4+0.2*cap(random(),0,0.999999)},
            ...(["STRIP","CONE","SWEEP"].includes(String(plan.attackArea?.shape))?{areaAngleDegrees:Math.floor(cap(random(),0,0.999999)*360)}:{})}
          :{trajectory:npcAttackTrajectory(random,physicalAttackStart(next,"NPC",source)),attackSource:source}
        :{};
      next=applyResolvedCombatSkill(next,"NPC",plan,{
        ...aim,requestId:"npc-skill-"+next.round+"-"+npc.spentTicks+"-"+plan.id,
      },makeDice());
      continue;
    }
    const castMagic=npc.magicAttack>0 && (next.mana?.NPC?.current??0)>=1 && distance<=BASIC_MAGIC_RANGE_METERS && random()<(profile==="AGGRESSIVE"?0.6:0.25);
    const attackSource=defaultAttackSource(npc);
    const weapon=weaponForSource(npc,attackSource);
    const physicalReach=effectiveWeaponReachMeters(npc,false,attackSource);
    // Training opponents notice visible enemy mirrors. They may deliberately
    // break a nearby mirror or cast at it; neither is free damage to its owner.
    const enemyMirrors=(next.constructions??[]).filter(c=>
      c.form==="MIRROR"&&c.owner==="PLAYER"&&(c.durability??0)>0);
    const mirrorTarget=enemyMirrors.length&&random()<0.35?enemyMirrors[0]:undefined;
    if(distance>physicalReach && !castMagic) {
      const maximum=Math.max(1,Math.round(npc.race/10));
      const meters=Math.min(maximum,Math.max(0.01,distance-Math.max(0.1,physicalReach-0.05)));
      const from=fieldPosition(npc);
      const forwardX=npc.positionMeters+(Math.sign(player.positionMeters-npc.positionMeters)||1)*
        Math.min(meters,Math.abs(player.positionMeters-npc.positionMeters));
      const forward={x:forwardX,y:from.y};
      if(!blockingMovement(next.constructions,from,forward)){
        next=applyCombatCommand(next,"NPC",{kind:"MOVE",meters,direction:"TOWARD"},makeDice());
      }else{
        // Do not let auto-ADVANCE fail endlessly against a player-created
        // barrier. Pick the first measured legal side-step, or end this turn.
        // VECTOR movement is capped to the existing 1m hand-drawn step.
        const to=fieldPosition(player),heading=Math.atan2(to.y-from.y,to.x-from.x);
        const stride=Math.min(1,meters);
        const deviations=[Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,
          3*Math.PI/4,-3*Math.PI/4,Math.PI];
        const alternative=deviations.map(angle=>({
          x:Math.round(Math.cos(heading+angle)*stride*1000)/1000,
          y:Math.round(Math.sin(heading+angle)*stride*1000)/1000,
        })).find(move=>Math.hypot(move.x,move.y)>=0.01&&
          !blockingMovement(next.constructions,from,{x:from.x+move.x,y:from.y+move.y}));
        next=alternative
          ?applyCombatCommand(next,"NPC",{kind:"MOVE",meters:Math.round(
             Math.hypot(alternative.x,alternative.y)*1000)/1000,
             direction:"VECTOR",planarMove:alternative},makeDice())
          :applyCombatCommand(next,"NPC",{kind:"WAIT"},makeDice());
      }
    } else {
      next=castMagic
        ? applyCombatCommand(next,"NPC",{kind:"ATTACK",attackType:npc.attackType,usesMagic:true,
            areaCenter:mirrorTarget?{...mirrorTarget.center}:
              {x:cap(random(),0,0.999999),y:cap(random(),0,0.999999)},
            targetConstructionId:mirrorTarget?.id},makeDice())
        : weapon?.mode==="RANGED"
          ?applyCombatCommand(next,"NPC",{kind:"ATTACK",attackSource,attackType:weapon.attackType,
            rangedPhysical:true,areaCenter:mirrorTarget?{...mirrorTarget.center}:
              {x:0.4+0.2*cap(random(),0,0.999999),
              y:0.4+0.2*cap(random(),0,0.999999)},
            targetConstructionId:mirrorTarget?.id},makeDice())
          :applyCombatCommand(next,"NPC",{kind:"ATTACK",attackSource,attackType:weapon?.attackType??"BLUNT",
            trajectory:mirrorTarget?[
              physicalAttackStart(next,"NPC",attackSource)??{x:cap(mirrorTarget.center.x-0.3,0,1),y:mirrorTarget.center.y},
              {...mirrorTarget.center}
            ]:npcAttackTrajectory(random,physicalAttackStart(next,"NPC",attackSource)),
            targetConstructionId:mirrorTarget?.id},makeDice());
    }
  }
  throw new Error("La IA alcanzó el límite de acciones por actualización.");
}
