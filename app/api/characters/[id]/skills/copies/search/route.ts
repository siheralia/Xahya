import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canCopySkill, COPY_MODES, type CopyEffect, type CopyMode } from "@/lib/skills/copy";
import { copyComplexityPch } from "@/lib/skills/copy-complexity";
import { defaultEffectPricing } from "@/lib/skills/pch";
import { readEffectPricing } from "@/lib/effects/pricing";

type SourceRow = {
  id: number;
  name: string;
  characterId: number;
  characterName: string;
  pchCost: number;
  grantedRaceSkill: number;
  grantedRacePerk: number;
  effectText: string;
};

/** Search approved, compatible source skills by name, not by numeric IDs. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const characterId = Number((await params).id);
  if (!Number.isSafeInteger(characterId) || characterId <= 0)
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = (await db.orm.public.User.all()).find(candidate => candidate.clerkId === userId);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!user || !character || (Number(character.userId) !== Number(user.id) && !["GM", "ADMIN"].includes(String(user.role))))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const term = (url.searchParams.get("q") ?? "").trim().normalize("NFKC");
  const copierSkillId = Number(url.searchParams.get("copierSkillId"));
  const mode = url.searchParams.get("mode") as CopyMode | null;
  if (term.length > 80)
    return NextResponse.json({ error: "La búsqueda no puede superar 80 caracteres." }, { status: 400 });
  if (!Number.isSafeInteger(copierSkillId) || copierSkillId <= 0 || !mode || !COPY_MODES.includes(mode))
    return NextResponse.json({ error: "Modalidad o habilidad copiadora inválida." }, { status: 400 });

  const copier = await (db.orm.public as any).Skill
    .where({ id: copierSkillId, characterId, status: "APPROVED" }).first();
  const copyEffect = (Array.isArray(copier?.effect) ? copier.effect : [] as CopyEffect[])
    .find((effect: CopyEffect) => effect?.type === "COPY_SKILL" && (effect.copyMode ?? "PERMANENT") === mode) as CopyEffect | undefined;
  if (!copyEffect)
    return NextResponse.json({ error: "No tienes una habilidad de copia aprobada con esa modalidad." }, { status: 403 });
  if (term.length < 2) return NextResponse.json({ skills: [] }, { headers: { "Cache-Control": "private, no-store" } });

  // Escape wildcard syntax: searching '%' or '_' must not list all skills.
  const safeTerm = term.replace(/[!%_]/g, match => "!" + match);
  const pattern = "%" + safeTerm + "%";
  const sourceQuery = db.raw.sql`
    SELECT s.id, s.name, s."characterId", c.name AS "characterName",
      s."pchCost",
      COALESCE(s."grantedByRaceSkillId",0) AS "grantedRaceSkill",
      COALESCE(s."grantedByRacePerkId",0) AS "grantedRacePerk",
      s.effect::text AS "effectText"
    FROM public."skill" s
    JOIN public."character" c ON c.id = s."characterId"
    WHERE s.status='APPROVED'
      AND s.name ILIKE ${pattern} ESCAPE '!'
      AND s.id <> ${copierSkillId}
      AND NOT EXISTS (SELECT 1 FROM public."skillCopy" sc WHERE sc."copiedSkillId"=s.id)
    ORDER BY CASE WHEN lower(s.name)=lower(${term}) THEN 0 ELSE 1 END, s.name, s.id
    LIMIT 80
  `.returnsRow({
    id: "pg/int4@1", name: "pg/text@1", characterId: "pg/int4@1",
    characterName: "pg/text@1", pchCost: "pg/int4@1",
    grantedRaceSkill: "pg/int4@1", grantedRacePerk: "pg/int4@1",
    effectText: "pg/text@1",
  }).build();
  const rows = await db.runtime().query(sourceQuery) as SourceRow[];
  const pricing = { ...defaultEffectPricing(), ...await readEffectPricing() };
  const skills: Array<{ id: number; name: string; characterName: string; complexityPch: number }> = [];
  for (const row of rows) {
    let effects: Array<{type: string}>;
    try {
      effects = JSON.parse(row.effectText);
      if (!Array.isArray(effects)) continue;
    } catch { continue; }
    const complexity = copyComplexityPch({ pchCost: row.pchCost, effect: effects }, pricing);
    if (canCopySkill(copyEffect, {
      pchCost: complexity, effect: effects,
      grantedByRacePerkId: row.grantedRacePerk || null,
      grantedByRaceSkillId: row.grantedRaceSkill || null,
    }, mode)) continue;
    skills.push({
      id: row.id,
      name: row.name,
      characterName: row.characterName,
      complexityPch: complexity,
    });
    if (skills.length >= 20) break;
  }
  return NextResponse.json({ skills }, { headers: { "Cache-Control": "private, no-store" } });
}
