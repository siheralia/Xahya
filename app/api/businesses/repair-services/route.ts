import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {
 MANAGED_REPAIR_SERVICES_KEY,readManagedRepairServices,authorizedRepairServices
} from "@/lib/managed-repair-services";

const validId=(id:number)=>Number.isSafeInteger(id)&&id>0;
async function currentUser(){
 const {userId:clerkId}=await auth();
 if(!clerkId)return null;
 return (await db.orm.public.User.all()).find(u=>u.clerkId===clerkId)??null;
}

/** Businesses can only advertise centrally defined, explicitly assigned offers.
 * No owner-controlled price, materials, or effect graph is ever read here.
 */
export async function GET(req:Request){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const businessId=Number(new URL(req.url).searchParams.get("businessId"));
 if(!validId(businessId))return NextResponse.json({error:"Negocio inválido."},{status:400});
 const Business=(db.orm.public as any).Business;
 const business=await Business.where({id:businessId}).first();
 if(!business)return NextResponse.json({error:"Negocio no encontrado."},{status:404});
 const owner=await db.orm.public.Character.where({id:Number(business.ownerCharacterId)}).first();
 const canSeeInactive=String(user.role)==="ADMIN"||Number(owner?.userId)===Number(user.id);
 if(!business.active&&!canSeeInactive)
  return NextResponse.json({error:"Negocio no disponible."},{status:404});
 const setting=await (db.orm.public as any).AppSetting
  .where({key:MANAGED_REPAIR_SERVICES_KEY}).first();
 const services=authorizedRepairServices(
  readManagedRepairServices(setting?.value),businessId,canSeeInactive
 );
 const items=(await (db.orm.public as any).Item.all())
  .filter((x:any)=>String(x.itemType)==="MATERIAL"&&
   services.some(s=>s.materialItemId===Number(x.id)));
 return NextResponse.json({
  business:{id:businessId,name:String(business.name),active:Boolean(business.active)},
  canEdit:false,services,materials:items.map((x:any)=>({id:Number(x.id),name:String(x.name)}))
 });
}

/** Retired endpoint: never let an owner restore the old editing capability.
 * All modifications are through /api/management/businesses/repair-services.
 */
export async function POST(){
 return NextResponse.json({
  error:"Los servicios los define Gestión. Los negocios solo pueden ofrecer servicios autorizados."
 },{status:403});
}
