/** Range shown by skill-selection controls must use the position that the
 * server actually uses. Offensive skills may pay for a BEFORE movement, but
 * construction skills (including mirrors) cannot combine creation with a move.
 */
export function combatSkillTargetOutOfRange(
 skill:{skillKind:string;constructionMaterial?:string|null;rangeMeters:number|null},
 distance:{attackMeters:number;currentOpponentMeters:number},
):boolean {
 if(skill.rangeMeters===null||!Number.isFinite(skill.rangeMeters))return false;
 if(skill.skillKind==="CONSTRUCTION"&&skill.constructionMaterial==="MIRROR")
  return distance.currentOpponentMeters>skill.rangeMeters;
 if(skill.skillKind==="OFFENSE")return distance.attackMeters>skill.rangeMeters;
 return false;
}
