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
        case "CREATE_FIELD": {
          const radius=Array.isArray(action.rings)?Math.max(0,...action.rings.map(r=>r.radius)):0;
          const ppm=Array.isArray(action.rings)?Math.max(0,...action.rings.map(r=>r.ppm)):0;
          return total+8+(action.rings?.length??0)*2+Math.ceil(radius/5)+Math.ceil(Math.log2(1+ppm/100))+
            Math.ceil((action.spreadMeters??0)/5);
        }
        case "CHANGE_FIELD": return total + 3;
        case "EXPOSE": return total + (action.fromField ? 6 : 4+Math.ceil(Math.log2(1+action.amount/100)));
        case "CLEANSE": return total + 4;
        case "STATUS": return total + 5 + (action.stat ? 4+Math.ceil(Math.abs(Math.log2(Math.max(.01,action.multiplier??1)))*2) : 0);
        case "MANA_WARD": return total + 8 + Math.ceil(action.level/2) + Math.ceil(action.durationTurns/5);
        default: return total;
      }
    },0);
    return sum + 2 + (rule.conditions?.length??0)*2 + actionsCost;
  },0) + (mechanics.activationConditions?.length??0)*2;
}
