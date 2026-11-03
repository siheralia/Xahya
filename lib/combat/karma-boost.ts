/** Server-authoritative input validation for a single 1-PA karma boost action.
 * No per-action stat-point cap: only the actual wallet balance limits spending.
 */
export function validateKarmaBoostAllocation(
 raw:unknown,allowedKeys:ReadonlySet<string>,
):{allocation:Record<string,number>;points:number;cost:number}{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Distribución de karma inválida.");
 const entries=Object.entries(raw);
 if(entries.length===0)throw new Error("Elige al menos una estadística base.");
 const allocation:Record<string,number>={};
 let points=0;
 for(const [stat,value] of entries){
  if(!allowedKeys.has(stat))throw new Error("Estadística base no disponible: "+stat);
  if(!Number.isSafeInteger(value)||Number(value)<=0)
   throw new Error("Cada bonificación debe ser un número entero positivo.");
  points+=Number(value);
  if(!Number.isSafeInteger(points)||points>Number.MAX_SAFE_INTEGER/2)
   throw new Error("Cantidad de karma fuera del rango permitido.");
  allocation[stat]=Number(value);
 }
 return {allocation,points,cost:points*2};
}
