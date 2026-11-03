import {
  applyCombatCommand, canAct, contestChance, matchupMultiplier, remainingAp, turnTicks,
  type CombatCommand, type CombatState, type DefenseChoice, type Point,
} from "./turn-engine.ts";

export type NpcDice = { hit: number; critical: number; defense: number };
export type NpcRandom = () => number;
const cap = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
  const factor = matchupMultiplier(state.pending.attackType,npc.defenseType);
  // On tight action budgets, the NPC may take a survivable hit to preserve
  // its next initiative. Otherwise it actually defends and still counterattacks
  // on its alternating initiative. NONE costs no AP; attacks remain paid.
  const roundStart = (state.round-1)*100;
  const attackedThisRound = state.log.some(e =>
    e.kind==="ATTACK" && e.by==="NPC" && e.tick>roundStart);
  const reactionTicks = turnTicks(npc);
  const canCounterNow = npc.spentTicks + reactionTicks <= attacker.spentTicks;
  // A speed tie alternates proactive initiatives even after a reaction.
  // Keep the defensive choice whenever enough AP/ticks remain to retaliate.
  const canDefendAndCounter = remainingAp(npc) >= 2
    && npc.spentTicks + reactionTicks < 100;
  const power = state.pending.usesMagic ? attacker.magicAttack : attacker.physicalAttack;
  const protection = state.pending.usesMagic ? npc.magicDefense : npc.physicalDefense;
  const worstDirectDamage = Math.max(1,Math.round(
    power*1.5*factor - protection*0.75));
  if(!attackedThisRound && canCounterNow && !canDefendAndCounter && npc.hp>worstDirectDamage) {
    return {kind:"DEFEND",defense:"NONE"};
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
      next=applyCombatCommand(next,"NPC",chooseNpcReaction(next,random),makeDice());
      continue;
    }
    if(!canAct(next,"NPC"))return next;
    const npc=next.actors.NPC, player=next.actors.PLAYER;
    const playerReady=canAct(next,"PLAYER");
    // The NPC reaches the next action slot once enough time has elapsed
    // on the shared 100-tick timeline. If PLAYER cannot act, run the NPC now.
    const npcSlotReady = npc.spentTicks + turnTicks(npc) <= player.spentTicks;
    if(playerReady&&!npcSlotReady)return next;
    const distance=Math.abs(npc.positionMeters-player.positionMeters);
    if(distance>2) {
      const maximum=Math.max(1,Math.round(npc.race/10));
      const meters=Math.min(maximum,Math.max(0.01,distance-1.5));
      next=applyCombatCommand(next,"NPC",{kind:"MOVE",meters,direction:"TOWARD"},makeDice());
    } else {
      next=applyCombatCommand(next,"NPC",{kind:"ATTACK",attackType:npc.attackType},makeDice());
    }
  }
  throw new Error("La IA alcanzó el límite de acciones por actualización.");
}
