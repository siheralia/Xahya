import type {SkillMechanics} from "@/lib/skills/interaction-engine";

/**
 * General surcharge for executable rules on top of existing effect prices.
 * Conditions and free-form descriptions never grant unpriced execution power.
 */
export function mechanicsPchCost(mechanics:SkillMechanics|undefined|null):number {
  if (!mechanics || !Array.isArray(mechanics.rules)) return 0;
  return mechanics.rules.reduce((sum, rule) => {
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    const actionsCost=actions.reduce((total, action) => {
      switch(action.kind) {
        case "CREATE_FIELD": return total + 8 + (Array.isArray(action.rings)?action.rings.length*2:0);
        case "CHANGE_FIELD": return total + 3;
        case "EXPOSE": return total + (action.fromField ? 6 : 4);
        case "CLEANSE": return total + 4;
        case "STATUS": return total + 5 + (action.stat ? 4 : 0);
        case "MANA_WARD": return total + 8;
        default: return total;
      }
    },0);
    return sum + 2 + (rule.conditions?.length??0)*2 + actionsCost;
  },0) + (mechanics.activationConditions?.length??0)*2;
}
