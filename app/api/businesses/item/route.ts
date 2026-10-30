import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getUser(){const {userId:clerkId}=await auth();if(!clerkId)return null;const users=await db.orm.public.User.all();return users.find((u)=>u.clerkId===clerkId)??null;}
export async function POST(request:Request){
  const user=await getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);const characterId=Number(body?.characterId);const productId=Number(body?.productId);
  const Character=db.orm.public.Character;const Product=(db.orm.public as any).BusinessProduct;
  const character=await Character.where({id:characterId}).first();if(!character||Number(character.userId)!==Number(user.id))return NextResponse.json({error:"Forbidden"},{status:403});
  const product=await Product.where({id:productId}).first();if(!product||!product.active||Number(product.stock)<=0)return NextResponse.json({error:"Producto no disponible."},{status:404});
  const Item=(db.orm.public as any).Item;const item=await Item.where({id:Number(product.itemId)}).first();if(!item||String(item.itemType)==="PROPERTY")return NextResponse.json({error:"Producto inválido."},{status:400});
  if (item.propertyBusinessId != null && Number(item.propertyBusinessId) !== Number(product.businessId)) return NextResponse.json({error:"Esta propiedad está reservada para otro negocio."},{status:403});
  const price=Number(product.salePrice);
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({error:"Precio de venta inválido."},{status:400});
  try{
    const result=await db.transaction(async(tx)=>{const R=tx.orm.public.CharacterResource;const B=(tx.orm.public as any).Business;const P=(tx.orm.public as any).BusinessProduct;const CI=(tx.orm.public as any).CharacterItem;const resource=await R.where({characterId}).first();if(!resource||Number(resource.money)<price)throw new Error("NO_MONEY");const business=await B.where({id:Number(product.businessId)}).first();if(!business||!business.active)throw new Error("BUSINESS_INACTIVE");const current=await P.where({id:product.id}).first();if(!current||!current.active||Number(current.stock)<=0)throw new Error("OUT_OF_STOCK");if(!Number.isFinite(Number(current.salePrice))||Number(current.salePrice)<0||Number(current.salePrice)!==price)throw new Error("INVALID_PRICE");const updatedResource=await R.where({id:resource.id}).update({money:Number(resource.money)-price});await B.where({id:business.id}).update({balance:Number(business.balance)+price});await P.where({id:product.id}).update({stock:Number(current.stock)-1});const owned=await CI.create({characterId,itemId:Number(item.id),quantity:1,equipped:false,equippedSlot:null});return {updatedResource,owned};});
    if (!result.updatedResource) return NextResponse.json({ error: "No se pudo actualizar tu dinero." }, { status: 500 });
    return NextResponse.json({owned:result.owned,money:Number(result.updatedResource.money)});
  }catch(e){if(e instanceof Error&&e.message==="NO_MONEY")return NextResponse.json({error:"No tienes suficiente dinero."},{status:400});if(e instanceof Error&&e.message==="BUSINESS_INACTIVE")return NextResponse.json({error:"Negocio no disponible."},{status:409});if(e instanceof Error&&e.message==="INVALID_PRICE")return NextResponse.json({error:"Precio de venta inválido."},{status:409});if(e instanceof Error&&e.message==="OUT_OF_STOCK")return NextResponse.json({error:"El objeto se agotó justo antes de la compra."},{status:409});return NextResponse.json({error:"No se pudo comprar el objeto."},{status:500});}
}