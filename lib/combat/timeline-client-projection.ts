/**
 * The live V2 API must not serialize the rival's private inventory, copied
 * item identifiers, spell catalog, internal receipts or frozen mechanics.
 * Everything needed to draw the visible fight (position, HP, mana, equipped
 * tool names, projectiles, summons and public statuses) remains available.
 *
 * This is a CLONE; never pass its redacted fields back to the resolver.
 */
import {combatClientView} from "./magic-area.ts";
import type {CombatState,Side} from "./turn-engine.ts";

export type TimelineViewer=Side|"SPECTATOR";
const sides=["PLAYER","NPC"] as const;

function redactPrivateCopies(fighter:CombatState["actors"][Side]):void{
 const tools=[fighter.equippedWeapon,fighter.offhandWeapon,
   ...(fighter.equippedWearables??[])];
 for(const tool of tools){
   if(!tool)continue;
   // The catalog ID and physical appearance may be public, but which exact
   // CharacterItem copy is equipped belongs to its owner.
   delete tool.characterItemId;
   delete tool.autoRepair;
 }
 delete fighter.equipmentDerivedReplay;
}

export function publicV2CombatState(
 original:CombatState,viewer:TimelineViewer,
):CombatState{
 const state=combatClientView(original);
 delete state.processedSkillRequests;
 delete state.processedKarmaRequests;
 delete state.processedItemRequests;
 delete state.processedActionRequests;
 delete state.itemRepairsThisRound;
 delete state.karmaBoostDeltas;
 delete state.mirrorRayQueue;
 delete state.trainingNpc; // NPC AI's frozen hidden spells are server-only
 // Only the authenticated owner has access to their own materialized stock,
 // cooldowns, chosen charge wallet and item-copy identifiers.
 for(const side of sides){
   if(viewer===side)continue;
   if(state.consumables)state.consumables[side]=[];
   if(state.skillCooldowns)delete state.skillCooldowns[side];
   if(state.combatCharges)delete state.combatCharges[side];
   if(state.karmaBoosts)delete state.karmaBoosts[side];
   redactPrivateCopies(state.actors[side]);
   if(state.activeBlocks?.[side])
     delete state.activeBlocks[side].characterItemId;
 }
 for(const entry of state.droppedWeapons??[]){
   if(viewer===entry.owner)continue;
   delete entry.weapon.characterItemId;
   delete entry.weapon.autoRepair;
 }
 for(const summon of state.summons??[]){
   if(viewer===summon.owner)continue;
   // The creature's appearance, position, HP and declared behavior remain
   // visible, but not its hidden effect graph, stat link formula or wallet.
   summon.contactEffects=[];
   summon.links=[];
   summon.charges={};
   delete summon.fusedFrom;
 }
 for(const construction of state.constructions??[]){
   if(viewer===construction.owner)continue;
   // Preserve visible material/position/shape; omit unreleased hidden spell
   // multipliers until the ray has actually resolved.
   delete construction.mirror;
 }
 return state;
}
