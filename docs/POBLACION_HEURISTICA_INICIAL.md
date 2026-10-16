# Normalización heurística inicial de cohortes sociales

## Estado y alcance

Esta política documenta cómo convertir una cohorte agregada por locación en cohortes sociales disjuntas. **No constituye evidencia canónica**: los porcentajes son parámetros iniciales revisables, no hechos históricos del mundo.

## Reglas no negociables

- No inventar razas ni porcentajes raciales. Mantener raza como «Sin especificar» hasta que el canon aporte composición.
- No cambiar la población ni la riqueza total de una locación al dividir una cohorte.
- No mantener activa la cohorte agregada original al activar sus segmentos, porque duplicaría población y riqueza.
- No crear población para locaciones sin cohortes: falta una fuente independiente de población.
- No repartir automáticamente riqueza extraordinaria como si fuera riqueza familiar normal. Una concentración extrema, como la observada en Vanamati, debe quedar marcada para revisión antes de cualquier redistribución.
- Usar únicamente ocupaciones y clases sociales ya presentes en los catálogos oficiales.
- Conservar parámetros demográficos y económicos de origen salvo que la heurística defina explícitamente una variación y quede auditada.

## Perfiles heurísticos iniciales

La distribución de población se propone en perfiles disjuntos, ajustables por locación:

| Perfil | Peso inicial | Ocupación | Clase social | Edad |
|---|---:|---|---|---|
| Producción primaria | 24% | Agricultura y ganadería | Popular | Adulta |
| Oficios y manufactura | 16% | Artesanía y manufactura | Trabajadora | Adulta |
| Comercio y transporte | 12% | Comercio | Media baja | Adulta |
| Servicios y cuidados | 12% | Servicios | Trabajadora | Adulta |
| Gobierno y defensa | 7% | Administración y gobierno | Media | Adulta |
| Conocimiento, magia y salud | 7% | Educación e investigación | Media | Adulta |
| Infancia y adolescencia | 14% | Estudiantes | Popular | Infantil y juvenil |
| Mayores y retiro | 8% | Jubilación o retiro | Popular | Mayor |
| **Total** | **100%** | | | |

Los pesos describen un punto de partida genérico, no una afirmación sobre cada ciudad. Antes de automatizar su aplicación hay que considerar el tipo de locación, el canon local y si las categorías «Estudiantes» y «Jubilación o retiro» son apropiadas para ese mundo.

## Aritmética exacta

Para dividir un total entero, calcular cada cuota por peso, truncar a entero y distribuir las unidades restantes por mayor residuo decimal (método de restos mayores). Aplicar el método por separado a población y riqueza garantiza que las sumas finales sean idénticas a los totales de origen. La riqueza debe revisarse por separado cuando haya concentraciones atípicas; conservar el total no justifica inventar quién posee esa riqueza.

## Estado observado en la auditoría anterior

La auditoría reportó 34 locaciones, 27 cohortes activas y 1,515,000 habitantes representados. Siete locaciones no tenían cohortes activas. Esos resultados no prueban que esas locaciones estén despobladas. La riqueza agregada reportada fue 9,123,080,500; Vanamati concentraba 5,001,140,000 para una población reportada de 12,000, un valor que requiere revisión de canon o de unidad antes de repartir riqueza.

## Criterio de aceptación

La normalización solo se considera válida cuando una auditoría posterior verifica, por locación y globalmente, que población y riqueza activas no cambiaron, que no hay perfiles duplicados, que la cohorte padre quedó inactiva y que no se añadieron habitantes a locaciones previamente vacías.