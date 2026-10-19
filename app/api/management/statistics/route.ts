import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SETTING_KEY = "statistics.catalog.v1";
const BASIC = [
  ["strength","Fuerza","STR"],["agility","Agilidad","AGI"],["constitution","Constitución","CON"],
  ["intelligence","Inteligencia","INT"],["wisdom","Sabiduría","WIS"],["charisma","Carisma","CHA"],
  ["spirit","Espíritu","SPI"],["luck","Suerte","LCK"],
] as const;
const DERIVED = [
  ["maxHp","HP máximo","10 + constitution * 2"],["maxMana","Maná máximo","5 + intelligence + spirit"],
  ["physicalAttack","Ataque físico","strength + agility / 4"],["magicAttack","Ataque mágico","intelligence + spirit"],
  ["physicalDefense","Defensa física","constitution + agility / 4"],["magicDefense","Defensa mágica","spirit + wisdom"],
  ["precision","Precisión","agility / 2 + intelligence / 2 + wisdom / 2 + spirit / 2 + luck / 3"],
  ["critical","Crítico","luck * 2 + precision / 10 + wisdom / 2"],["discovery","Hallazgo","luck + wisdom"],
  ["miracle","Milagro","luck + spirit / 2 + charisma / 2"],["intimidation","Intimidación","charisma + strength"],
  ["conquest","Conquista","charisma + luck"],["race","Carrera","min(agility, strength) + constitution / 4"],
  ["dodge","Evasión","luck * 3 + agility + wisdom / 2"],
  ["stealth","Sigilo","agility + intelligence / 2 - spirit / 10"],["detection","Detección","wisdom + luck / 3"],
] as const;
type StatDef = {key:string;name:string;code:string;kind:"basic"|"derived";active:boolean;showOnSheet:boolean;showOnPolygon:boolean;defaultValue:number;formula:string;order:number};
function defaults(): StatDef[] {
  return [
    ...BASIC.map(([key,name,code],order)=>({key,name,code,kind:"basic" as const,active:true,showOnSheet:true,showOnPolygon:true,defaultValue:0,formula:"",order})),
    ...DERIVED.map(([key,name,formula],i)=>({key,name,code:key.replace(/[A-Z]/g,m=>"_"+m).toUpperCase(),kind:"derived" as const,active:true,showOnSheet:true,showOnPolygon:true,defaultValue:0,formula,order:BASIC.length+i})),
  ];
}
async function getAdmin() {
  const { userId } = await auth(); if (!userId) return null;
  const users = await db.orm.public.User.all();
  return users.find((u:any)=>u.clerkId===userId && String(u.role)==="ADMIN") ?? null;
}
async function readCatalog(): Promise<StatDef[]> {
  const Setting=(db.orm.public as any).AppSetting;
  const row=Setting ? await Setting.where({key:SETTING_KEY}).first() : null;
  if (!row?.value) return defaults();
  try {
    const parsed=JSON.parse(String(row.value));
    return Array.isArray(parsed) ? parsed : defaults();
  } catch { return defaults(); }
}
async function writeCatalog(catalog:StatDef[]) {
  const Setting=(db.orm.public as any).AppSetting;
  if (!Setting) throw new Error("El almacenamiento de configuración no está disponible.");
  const row=await Setting.where({key:SETTING_KEY}).first();
  if (row) await Setting.where({id:row.id}).update({value:JSON.stringify(catalog)});
  else await Setting.create({key:SETTING_KEY,value:JSON.stringify(catalog)});
}
function validFormula(formula:string) {
  if (!formula.trim()) return false;
  if (formula.length>500 || /[^\w\s.+\-*/()% ,]/u.test(formula)) return false;
  if (/\b(eval|function|constructor|globalThis|process|require|import|window|document)\b/i.test(formula)) return false;
  return true;
}
export async function GET() {
  const admin=await getAdmin();
  if (!admin) return NextResponse.json({error:"Solo ADMIN puede gestionar las estadísticas."},{status:403});
  const catalog=await readCatalog();
  return NextResponse.json({statistics:catalog,protectedCombat:["physicalAttack","physicalDefense","magicAttack","magicDefense"]});
}
export async function PUT(request:Request) {
  const admin=await getAdmin();
  if (!admin) return NextResponse.json({error:"Solo ADMIN puede gestionar las estadísticas."},{status:403});
  try {
    const body=await request.json();
    if (!Array.isArray(body.statistics) || body.statistics.length>200) return NextResponse.json({error:"Catálogo inválido."},{status:400});
    const previous=await readCatalog();
    const incoming:StatDef[]=body.statistics.map((raw:any,index:number)=>{
      const key=String(raw.key??"").trim();
      const name=String(raw.name??"").trim();
      const kind=raw.kind==="derived"?"derived":"basic";
      if (!/^[a-z][a-zA-Z0-9_]{1,63}$/.test(key) || !name || name.length>80) throw new Error("Cada estadística necesita una clave válida y un nombre de hasta 80 caracteres.");
      const old=previous.find(x=>x.key===key);
      if (old && old.kind!==kind) throw new Error("No se puede cambiar el tipo de una estadística existente.");
      if (kind==="derived" && !validFormula(String(raw.formula??""))) throw new Error("La fórmula de "+name+" no es válida.");
      return {key,name,code:String(raw.code??key.toUpperCase()).slice(0,40),kind,active:raw.active!==false,
        showOnSheet:raw.showOnSheet!==false,showOnPolygon:raw.showOnPolygon!==false,
        defaultValue:Number.isFinite(Number(raw.defaultValue))?Number(raw.defaultValue):0,
        formula:kind==="derived"?String(raw.formula??""):"",order:index};
    });
    if (new Set(incoming.map(x=>x.key)).size!==incoming.length) throw new Error("No puede haber claves repetidas.");
    const removed=previous.filter(old=>!incoming.some(x=>x.key===old.key));
    const basicRemoved=removed.filter(x=>x.kind==="basic");
    if (basicRemoved.length) {
      const fields=new Set(["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"]);
      const characters=await (db.orm.public as any).Character.all();
      const statsModel=(db.orm.public as any).CharacterStat;
      const resourcesModel=(db.orm.public as any).CharacterResource;
      for (const statDef of basicRemoved) {
        if (!fields.has(statDef.key)) throw new Error("La estadística básica "+statDef.name+" aún no tiene almacenamiento dinámico por personaje; desactívala en lugar de borrarla hasta completar esa migración.");
      }
      await db.transaction(async(tx:any)=>{
        const Stats=tx.orm.public.CharacterStat, Resources=tx.orm.public.CharacterResource;
        for (const character of characters) {
          const stats=await Stats.where({characterId:Number(character.id)}).first();
          const resources=await Resources.where({characterId:Number(character.id)}).first();
          if (!stats || !resources) continue;
          const refund=basicRemoved.reduce((sum,def)=>sum+Math.max(0,Number(stats[def.key]??0)),0);
          const changes=Object.fromEntries(basicRemoved.map(def=>[def.key,0]));
          await Stats.where({id:stats.id}).update(changes);
          if (refund) await Resources.where({id:resources.id}).update({levelUpPoints:Number(resources.levelUpPoints??0)+refund});
        }
      });
    }
    // Prevent deleting a derived definition while another retained formula still references it.
    for (const removedDef of removed.filter(x=>x.kind==="derived")) {
      if (incoming.some(x=>x.kind==="derived" && new RegExp("\\b"+removedDef.key+"\\b").test(x.formula))) {
        throw new Error("No puedes borrar "+removedDef.name+" mientras otra fórmula dependa de ella.");
      }
    }
    await writeCatalog(incoming);
    await recordAuditEvent({actorUserId:Number(admin.id),action:"STATISTICS_CATALOG_UPDATED",entityType:"STATISTICS_CATALOG",entityId:null,details:JSON.stringify({removed:removed.map(x=>x.key),basicRefunded:basicRemoved.map(x=>x.key),count:incoming.length})});
    return NextResponse.json({statistics:incoming,removed:removed.map(x=>x.key)});
  } catch(err) {
    return NextResponse.json({error:err instanceof Error?err.message:"No se pudo guardar el catálogo."},{status:400});
  }
}
