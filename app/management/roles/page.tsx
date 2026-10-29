"use client";
import { useCallback, useEffect, useState } from "react";

type Role={id:number;name:string;slug:string;color:string;protected:boolean;dailyPts:number;dailyKarma:number;dailyMoney:number;permissions:Record<string,string[]>};
type Assignment={userId:number;roleId:number};
type User={id:number;name:string;email:string;role:string};
const permissionOptions=[["management.characters","Personajes (general)"],["management.character-details","Detalles de personajes"],["management.character-resources","Recursos individuales"],["management.global-delivery","Entregas globales"],["management.skills","Habilidades"],["management.items","Objetos"],["management.labyrinth","Laberintos"],["management.finances","Finanzas"],["management.users","Usuarios"],["management.roles","Roles"],["management.statistics","Statistics"],["management.effects","Effects"],["management.races","Races"],["management.enemies","Enemies"],["management.ambientations","Ambientations"],["management.themes","Themes"],["management.store","Store"],["management.businesses","Businesses"],["management.world","World"],["management.perks","Perks"],["management.rules","Rules"],["management.rankings","Rankings"],["management.casino","Casino"],["management.social","Social"],["management.logs","Logs"]] as const;
const permissionActions:Record<string,string[]>={"management.characters":["view","edit","delete","transfer"],"management.character-details":["view","edit","change-race"],"management.character-resources":["view","grant"],"management.global-delivery":["view","grant"],"management.skills":["view","approve","reject","edit"],"management.items":["view","create","edit","delete","grant"],"management.labyrinth":["view","edit","operate"],"management.finances":["view","adjust","audit"],"management.users":["view","view-email","edit","assign-roles","delete"],"management.roles":["view","create","edit","delete"],"management.statistics":["view","edit"],"management.effects":["view","edit"],"management.races":["view","edit"],"management.enemies":["view","edit"],"management.ambientations":["view","edit"],"management.themes":["view","edit"],"management.store":["view","edit"],"management.businesses":["view","edit"],"management.world":["view","edit"],"management.perks":["view","edit"],"management.rules":["view","edit"],"management.rankings":["view","edit"],"management.casino":["view","edit"],"management.social":["view","edit"],"management.logs":["view"]};
const blank={name:"",slug:"",color:"#a1a1aa",dailyPts:0,dailyKarma:0,dailyMoney:0,permissions:{} as Record<string,string[]>};
export default function RolesPage(){
 const [roles,setRoles]=useState<Role[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [users,setUsers]=useState<User[]>([]);
 const [draft,setDraft]=useState(blank);
 const [editId,setEditId]=useState<number|null>(null);
 const [permissionsText,setPermissionsText]=useState("{}");
 const [permissionPage,setPermissionPage]=useState("management.characters");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const [r,u]=await Promise.all([fetch("/api/management/roles"),fetch("/api/management/users")]);
  if(!r.ok)throw new Error("No tienes acceso a la gestión de roles.");
  const [rolesData,usersData]=await Promise.all([r.json(),u.ok?u.json():Promise.resolve({users:[]})]);
  setRoles(rolesData.roles??[]);setAssignments(rolesData.assignments??[]);setUsers(usersData.users??[]);
 },[]);
 useEffect(()=>{load().catch(e=>setError(String(e.message)));},[load]);
 function edit(role:Role){setEditId(role.id);setDraft({name:role.name,slug:role.slug,color:role.color,dailyPts:role.dailyPts,dailyKarma:role.dailyKarma,dailyMoney:role.dailyMoney,permissions:role.permissions});setPermissionsText(JSON.stringify(role.permissions,null,2));}
 async function save(){
  setBusy(true);setError("");setMessage("");
  try{
   const permissions=JSON.parse(permissionsText);
   if(!permissions||typeof permissions!=="object"||Array.isArray(permissions)||Object.values(permissions).some(v=>!Array.isArray(v)||v.some(x=>typeof x!=="string")))throw new Error("Permisos: usa un objeto JSON con listas de acciones.");
   const response=await fetch("/api/management/roles",{method:editId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,permissions,...(editId?{id:editId}:{})})});
   const data=await response.json();if(!response.ok)throw new Error(data.error??"Error al guardar");
   setMessage("Rol guardado.");setEditId(null);setDraft(blank);setPermissionsText("{}");await load();
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}finally{setBusy(false);}
 }
 async function remove(role:Role){
  if(busy||role.protected||!window.confirm(`¿Eliminar el rol «${role.name}»? Esta acción no se puede deshacer.`))return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/management/roles",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:role.id})});
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(data?.error??"No se pudo eliminar el rol.");
   if(editId===role.id){setEditId(null);setDraft(blank);setPermissionsText("{}");}
   setMessage("Rol eliminado.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}finally{setBusy(false);}
 }
 async function toggle(userId:number,roleId:number,assigned:boolean){
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/management/roles/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,roleId,assigned})});
   const data=await response.json();if(!response.ok)throw new Error(data.error??"Error al asignar");
   setMessage("Asignación actualizada.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado");}finally{setBusy(false);}
 }
 const input="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-white";
 return <main className="min-h-screen bg-zinc-950 px-5 py-8 text-white"><div className="mx-auto max-w-5xl">
  <a href="/management/users" className="text-sm text-cyan-400">← Gestión de usuarios</a>
  <h1 className="mt-4 text-3xl font-bold">Gestión de roles</h1>
  <p className="mt-2 text-zinc-400">Los salarios diarios de todos los roles asignados se suman en la billetera del usuario. Los roles protegidos conservan sus permisos existentes.</p>
  {error&&<p role="alert" className="mt-4 text-red-400">{error}</p>}{message&&<p className="mt-4 text-emerald-400">{message}</p>}
  <section className="mt-6 rounded-xl border border-zinc-800 p-5">
   <h2 className="text-xl font-semibold">{editId?"Editar rol":"Crear rol"}</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label>Nombre<input className={input} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label>Identificador<input className={input} disabled={editId!==null} value={draft.slug} onChange={e=>setDraft({...draft,slug:e.target.value})}/></label>
    <label>Color del tag<input className={input} type="color" value={draft.color} onChange={e=>setDraft({...draft,color:e.target.value})}/></label>
    {(["dailyPts","dailyKarma","dailyMoney"] as const).map((key)=><label key={key}>{({dailyPts:"PTS diarios",dailyKarma:"Karma diario",dailyMoney:"Dinero diario"})[key]}<input className={input} type="number" min={0} step={1} value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-3"><label>Página <select className={input} value={permissionPage} onChange={e=>setPermissionPage(e.target.value)}>{permissionOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{(permissionActions[permissionPage]??[]).map(action=><label key={action} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.permissions[permissionPage]?.includes(action))} onChange={e=>{const next={...draft.permissions};const actions=new Set(next[permissionPage]??[]);if(e.target.checked)actions.add(action);else actions.delete(action);next[permissionPage]=[...actions];setDraft({...draft,permissions:next});setPermissionsText(JSON.stringify(next,null,2));}}/>{({view:"Ver",edit:"Editar",grant:"Entregar",approve:"Aprobar",reject:"Rechazar",create:"Crear",delete:"Eliminar",operate:"Operar",adjust:"Ajustar",audit:"Auditar","view-email":"Ver correos",transfer:"Transferir","assign-roles":"Asignar roles","change-race":"Cambiar raza"} as Record<string,string>)[action]??action}</label>)}</div><label className="mt-4 block">Permisos por página y acción (JSON)<textarea className={input} rows={4} value={permissionsText} onChange={e=>setPermissionsText(e.target.value)}/></label>
   <p className="mt-2 text-xs text-amber-300">Los permisos configurables requieren integración adicional con cada ruta protegida antes de conceder acceso efectivo.</p>
   <div className="mt-4 flex gap-3"><button disabled={busy} onClick={save} className="rounded-lg bg-cyan-600 px-5 py-2 disabled:opacity-50">Guardar rol</button>{editId!==null&&<button onClick={()=>{setEditId(null);setDraft(blank);setPermissionsText("{}");}} className="rounded-lg border border-zinc-700 px-4 py-2">Cancelar</button>}</div>
  </section>
  <section className="mt-6 rounded-xl border border-zinc-800 p-5"><h2 className="text-xl font-semibold">Roles existentes</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{roles.map(role=><div key={role.id} className="rounded-lg border border-zinc-800 p-4"><span className="rounded px-2 py-1 text-sm font-semibold" style={{backgroundColor:role.color,color:"#111"}}>{role.name}</span><p className="mt-3 text-sm text-zinc-400">{role.dailyPts} PTS · {role.dailyKarma} karma · {role.dailyMoney} dinero / día</p><div className="mt-3 flex gap-4"><button disabled={busy} onClick={()=>{edit(role);window.scrollTo({top:0,behavior:"smooth"});}} className="text-cyan-400 disabled:opacity-50">Editar</button>{!role.protected&&<button disabled={busy} onClick={()=>remove(role)} className="text-red-400 disabled:opacity-50">Eliminar</button>}</div></div>)}</div></section>
  <section className="mt-6 rounded-xl border border-zinc-800 p-5"><h2 className="text-xl font-semibold">Asignaciones</h2><div className="mt-4 space-y-4">{users.map(user=><div key={user.id} className="border-b border-zinc-800 pb-4"><p className="font-medium">{user.name} <span className="text-sm text-zinc-500">({user.email})</span></p><div className="mt-2 flex flex-wrap gap-4">{roles.filter(role=>!role.protected).map(role=><label key={role.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy||user.role==="BANNED"||user.role==="SYSTEM"} checked={assignments.some(a=>a.userId===user.id&&a.roleId===role.id)} onChange={e=>toggle(user.id,role.id,e.target.checked)}/>{role.name}</label>)}</div></div>)}</div></section>
 </div></main>;
}
