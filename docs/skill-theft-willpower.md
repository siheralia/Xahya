# Robar habilidad y choque de voluntades

## Reglas de costo

- **Robar habilidad** (`STEAL_SKILL`) cuesta **30 PCH base** (el doble de los 15 PCH base de `COPY_SKILL`).
- El poder exige capacidad de robo `>= 2 × complejidad real de la habilidad original`. La complejidad se recalcula con precios actuales; no se cobra esa cantidad en cada intento.
- Duración, fidelidad, cantidad de robos simultáneos y restricciones de habilidades raciales y especiales se configuran en el editor normal de efectos.
- No se permite robar otra habilidad de robo ni una copia ya creada.

## Choque de voluntades

1. Tras verificar propiedad, aprobación y complejidad, el servidor determina las estadísticas efectivas de ambos personajes y tira dos dados de 20 caras. El cliente no envía los dados ni elige el resultado.
2. **Atacante:** `1d20 + SPI` (su imposición espiritual).
3. **Defensor:** `1d20 + mejor estadística entre WIS, CHA y SPI`. WIS representa instinto, comprensión y experiencia; CHA, seguridad, presencia y determinación; SPI, resistencia espiritual y mágica.
4. Si el efecto habilita **Coerción corporal directa**, CON también es una defensa válida. La selección automática siempre toma la mayor estadística permitida.
5. El atacante tiene que **superar** el total del defensor. **El empate favorece al defensor.**
6. Si la víctima resiste, la transacción registra `SKILL_STEAL_RESISTED` con los dados, estadísticas, totales y referencia de habilidades; **no se crea una habilidad ni se bloquea la original**.
7. Si el atacante gana, la transacción registra `SKILL_STEAL` con el choque, crea la copia temporal y suspende la activación de la original hasta que expire el robo.

Para impedir ataques repetidos hasta obtener un dado favorable, existe una **espera de 60 segundos por atacante y habilidad objetivo**, aplicada por la base de datos incluso para choques fallidos. El propietario de la habilidad recupera su uso en la expiración por turnos del ladrón.

## Estado de la integración

Esta primera versión resuelve una resistencia automática con estadísticas efectivas de personajes registrados. No equivale aún a una elección interactiva de defensa por el jugador, combate PvP simultáneo, alcance real en mapa ni tiradas de resistencia configurables desde Gestión. Para futuras habilidades de coerción, reutilizar `lib/combat/willpower-clash.ts` sin inventar otros cálculos.

## Despliegue

Este PR sigue siendo un borrador. Antes de su publicación debe aplicarse la migración `supabase/migrations/20261102040000_temporary_skill_thefts.sql`, que crea `skillTheft` y `skillTheftAttemptGuard`. **No se ha aplicado en producción.** Las pruebas deterministas de reglas están en `tests/willpower-clash.test.mjs`.
