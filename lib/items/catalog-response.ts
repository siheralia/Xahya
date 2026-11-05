/** Defensive decoder for Clerk-authenticated management API responses.
 * A failed serverless function may return HTML or an empty body; neither should
 * ever reach Response.json() and mask the actual HTTP status as a SyntaxError.
 */
export async function parseCatalogResponse<T>(response:Response,resource:string):Promise<T>{
 const raw=await response.text();
 let data:unknown=null;
 if(raw.trim()){
  try{data=JSON.parse(raw);}catch{
   if(response.ok)throw new Error("El servidor devolvió una respuesta no válida para "+resource+".");
  }
 }
 const error=typeof data==="object"&&data!==null&&"error" in data
  &&typeof (data as {error:unknown}).error==="string"
   ?(data as {error:string}).error:null;
 if(!response.ok){
  if(error)throw new Error(error);
  if(response.status===401||response.status===403)
   throw new Error("Tu sesión no tiene permiso para consultar "+resource+". Vuelve a iniciar sesión.");
  throw new Error("No se pudieron cargar "+resource+" (error HTTP "+response.status+"). Inténtalo de nuevo.");
 }
 if(data===null||typeof data!=="object"||Array.isArray(data))
  throw new Error("El servidor no devolvió los datos de "+resource+". Inténtalo de nuevo.");
 return data as T;
}
