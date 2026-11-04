-- Xahya: auditoría de efectos configurados. SOLO LECTURA, no migración.
WITH definitions AS (
  SELECT 'character' AS source, id, name, effect AS effects FROM public.skill
  UNION ALL SELECT 'racial', id, name, effect FROM public."raceSkill"
  UNION ALL SELECT 'template', id, name, payload->'effect' FROM public."genericSkillTemplate"
), effects AS (
  SELECT source, id, name, entry.value AS effect
  FROM definitions
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(effects) = 'array' THEN effects ELSE '[]'::jsonb END
  ) entry
)
SELECT COALESCE(effect->>'type', '(sin tipo)') AS type,
       COUNT(*) AS occurrences,
       COUNT(DISTINCT source || ':' || id::text) AS definitions,
       COUNT(*) FILTER (WHERE source = 'character') AS character_effects,
       COUNT(*) FILTER (WHERE source = 'racial') AS racial_effects,
       COUNT(*) FILTER (WHERE source = 'template') AS template_effects,
       array_agg(DISTINCT source || ': ' || name ORDER BY source || ': ' || name) AS examples
FROM effects
GROUP BY 1
ORDER BY occurrences DESC, type;
