import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { CORE_BASIC_STAT_KEYS, initializeCharacterCustomBasicStats } from "@/lib/stats/dynamic";

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
      const defaultValue=Number.isFinite(Number(raw.defaultValue))?Number(raw.defaultValue):0;
      if (!/^[a-z][a-zA-Z0-9_]{1,63}$/.test(key) || !name || name.length>80) throw new Error("Cada estadística necesita una clave válida y un nombre de hasta 80 caracteres.");
      if (kind==="basic" && !Number.isInteger(defaultValue)) throw new Error("El valor predeterminado de una estadística básica debe ser un entero.");
      const old=previous.find(x=>x.key===key);
      if (old && old.kind!==kind) throw new Error("No se puede cambiar el tipo de una estadística existente.");
      if (kind==="derived" && !validFormula(String(raw.formula??""))) throw new Error("La fórmula de "+name+" no es válida.");
      return {key,name,code:String(raw.code??key.toUpperCase()).slice(0,40),kind,active:raw.active!==false,
        showOnSheet:raw.showOnSheet!==false,showOnPolygon:raw.showOnPolygon!==false,
        defaultValue,
        formula:kind==="derived"?String(raw.formula??""):"",order:index};
    });
    if (new Set(incoming.map(x=>x.key)).size!==incoming.length) throw new Error("No puede haber claves repetidas.");
    const removed=previous.filter(old=>!incoming.some(x=>x.key===old.key));
    const protectedCombat=new Set(["physicalAttack","physicalDefense","magicAttack","magicDefense"]);
    if (removed.some(x=>protectedCombat.has(x.key))) throw new Error("Ataque físico, defensa física, ataque mágico y defensa mágica son estadísticas obligatorias y no se pueden borrar.");
    // Validate dependencies before any refund or data mutation.
    for (const removedDef of removed.filter(x=>x.kind==="derived")) {
      if (incoming.some(x=>x.kind==="derived" && new RegExp("\\b"+removedDef.key+"\\b").test(x.formula))) {
        throw new Error("No puedes borrar "+removedDef.name+" mientras otra fórmula dependa de ella.");
      }
    }
    const basicRemoved=removed.filter(x=>x.kind==="basic");
    if (basicRemoved.length) {
      const characters=await (db.orm.public as any).Character.all();
      await db.transaction(async(tx:any)=>{
        const Stats=tx.orm.public.CharacterStat, Resources=tx.orm.public.CharacterResource;
        const Dynamic=(tx.orm.public as any).CharacterStatValue;
        for (const character of characters) {
          const characterId=Number(character.id);
          const stats=await Stats.where({characterId}).first();
          const resources=await Resources.where({characterId}).first();
          let refund=0;
          const coreChanges:Record<string,number>={};
          for (const definition of basicRemoved) {
            if (CORE_BASIC_STAT_KEYS.has(definition.key)) {
              refund+=Math.max(0,Number(stats?.[definition.key]??0));
              coreChanges[definition.key]=0;
            } else if (Dynamic) {
              const row=await Dynamic.where({characterId,statKey:definition.key}).first();
              refund+=Math.max(0,Number(row?.value??0));
              if (row) await Dynamic.where({id:Number(row.id)}).delete();
            }
          }
          if (stats && Object.keys(coreChanges).length) await Stats.where({id:stats.id}).update(coreChanges);
          if (resources && refund>0) await Resources.where({id:resources.id}).update({levelUpPoints:Number(resources.levelUpPoints??0)+refund});
        }
      });
    }
    await writeCatalog(incoming);
    const charactersToInitialize=await (db.orm.public as any).Character.all();
    await db.transaction(async(tx:any)=>{
      for (const character of charactersToInitialize) await initializeCharacterCustomBasicStats(Number(character.id),tx);
    });
    await recordAuditEvent({actorUserId:Number(admin.id),action:"STATISTICS_CATALOG_UPDATED",entityType:"STATISTICS_CATALOG",entityId:null,details:{removed:removed.map(x=>x.key),basicRefunded:basicRemoved.map(x=>x.key),count:incoming.length}});
    return NextResponse.json({statistics:incoming,removed:removed.map(x=>x.key)});
  } catch(err) {
    return NextResponse.json({error:err instanceof Error?err.message:"No se pudo guardar el catálogo."},{status:400});
  }
}
