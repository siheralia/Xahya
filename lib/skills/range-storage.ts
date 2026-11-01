export function serializeSkillRange(area: string | null | undefined, range: unknown): string {
 const meters=Number(range);
 if(!Number.isInteger(meters)||meters<0||meters>100) throw new Error("Distancia máxima inválida.");
 const clean=String(area??"").replace(/\s*\|\s*Alcance máximo:\s*\d+\s*m\s*/gi,"").trim();
 return `${clean||"Objetivo único"} | Alcance máximo: ${meters} m`;
}
