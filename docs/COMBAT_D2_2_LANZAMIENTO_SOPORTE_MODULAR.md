# Xahya — fase D2.2: lanzamiento autorizado de soporte modular personal

Fecha: 9 de noviembre de 2026. Base: PR #215 publicada (D2.1).

## Primer subconjunto de activaciones operativas

Las habilidades aprobadas con **efectos COMPOSED**, pagadas mediante el
circuito existente de PCH revisado por administración, ya pueden lanzar un
**soporte personal** que use el intérprete de micromódulos `ACTIVATE`.
Se admiten estas operaciones dentro de un gráfico validado:

- `READ_STAT`: leer una estadística permitida **del propio usuario**
  (`HP`, `MAX_HP`, fuerza, defensas, ataques, precisión y esquive).
- `CALCULATE`: encadenar aritmética, porcentajes y resultados previos.
- `HEAL`: recuperar HP propio, máximo **30 % del HP máximo por acción**,
  sin superar el máximo real. Solo una curación por lanzamiento.
- `BONUS`: sumar puntos temporalmente a ataque físico/mágico,
  defensa física/mágica, precisión o esquive. Máximo cuatro bonos
  (hasta +100 por bono y +200 acumulados por lanzamiento).

Esta fase permite hasta **cuatro contenedores ACTIVATE** y **doce pasos**.
No admite `DAMAGE`, `REPAIR_DURABILITY`, invocaciones, `MODIFIER`,
`CONSUME`, referencias de rival, estado guardado, terreno, área o
combinaciones de efectos heredados con COMPOSED. Los pasos y condiciones
fuera de este subconjunto mantienen el botón deshabilitado con su motivo.

**Contrato de habilidad:** categoría `SUPPORT`; área normalizada
**Personal (usuario)**; costo de maná positivo, sin mantenimiento
o acumulación; `status=APPROVED`; fecha de aprobación;
`pchCost` positivo y `reviewedPch` en cada efecto. Para bonos temporales
se requiere duración configurada entre 1 y 20 turnos; si solo cura debe
ser instantánea. El cooldown utiliza el contrato compartido y puede
ser sin cooldown, por número de turnos o una vez por combate.

## Ejemplo de juego — «Amparo entrelazado»

Una habilidad revisada por administración, con 8 puntos de maná de
activación, 2 turnos de duración y cooldown de 1 turno:

1. **Leer HP máximo** del combatiente real.
2. **Calcular el 10 %** de ese HP máximo.
3. **Curar** ese resultado al propio usuario, sin superar el HP máximo.
4. **Bonificar defensa mágica +4** por dos turnos.

Si la combatiente tiene 50/100 HP y 10 de defensa mágica,
su lanzamiento consume **8 maná y una acción con PA y ticks**.
El resultado es 60/100 HP y 14 de defensa mágica; el bono aparece en
«Estado y estadísticas» y vence al comenzar la ronda prevista.
El historial señala el maná pagado y los HP realmente recuperados.
Los efectos se guardan en el encuentro y sobreviven a recargar la página;
un `requestId` repetido no repite la curación ni el gasto.

Es **un ejemplo con datos simulados**, no una habilidad creada en la base
de datos ni PCH acreditados a un jugador.

## Seguridad e integración

- `/api/combat/[id]/actions` continúa consultando únicamente la
  habilidad `APPROVED` **del personaje propietario** dentro de la
  transacción bloqueada y verifica robo, requisitos y habilidad padre.
- `compileCombatSkill` compila desde esa fila **del servidor** y
  `compileApprovedSupportActivation` limita los micromódulos a los
  admitidos. El cliente solo envía el id de la habilidad y el requestId;
  se rechazan coordenadas, movimientos, objetos y objetivos ajenos.
- El motor debita maná **antes** de avanzar la ronda, usa los mismos
  PA/ticks y cooldowns, y guarda los bonos en `skillBonuses` con origen y
  expiración. La interpretación es pura: no puede escribir HP/maná global
  en la ficha ni autorizar daño sin defensa.
- `LEGACY_ONLY` (interruptor existente) desactiva
  **tanto el lanzamiento como el botón del catálogo**, sin desplegar ni
  editar filas. En `MODULAR_FIRST` se habilita solo este subconjunto.
- El grafo no se almacena en el estado que se devuelve al navegador;
  se ejecuta dentro del plan efímero del servidor.
- No hay cambios de esquemas ni nuevas compras de PCH automáticas.

## Siguiente paso — D2.3 y D3

Incorporar secuencialmente `APPLY_STATUS` validado y estados
persistentes por objetivo autorizado. Después implementar ataques
multicanal/áreas, trazos y defensas con la resolución oficial del
combate. Nunca convertir directamente un `DAMAGE` del intérprete en
una resta de HP; debe pasar por contactos, coberturas, defensa y
reacciones. Diseñar paridad PCH y límites de acumulación por familia.

Verificación: `tests/combat-approved-modular-activation.test.mjs`
y todas las suites existentes; sin tocar personajes de producción.
