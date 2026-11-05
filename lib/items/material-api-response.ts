/**
 * Material management can receive a non-JSON response when a server function
 * throws or the auth middleware redirects. Never surface the browser's
 * "Unexpected end of JSON input" or silently report an empty catalog.
 */
export async function readMaterialApiResponse<T extends Record<string,unknown>>(
 response:Response, fallback="No se pudo consultar el catálogo."
):Promise<T>{
 const raw=await response.text();
 let parsed:unknown;
 try{
  parsed=raw?JSON.parse(raw):null;
 }catch{
  parsed=null;
 }
 const body=parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;
 if(!response.ok){
  const reason=typeof body?.error==="string"&&body.error.trim()?body.error:
   response.status===401||response.status===403?"La sesión o los permisos no permiten consultar esta sección.":
   response.status>=500?"La consulta de materiales falló en el servidor. Vuelve a intentarlo.":
   fallback;
  throw new Error(reason+" (HTTP "+response.status+").");
 }
 if(!body){
  throw new Error("El servidor devolvió una respuesta vacía o no válida. Actualiza la página e inténtalo de nuevo.");
 }
 return body as T;
}
