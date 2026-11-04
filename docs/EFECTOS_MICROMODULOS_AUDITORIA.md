# Xahya — inventario real de efectos y base para micromódulos

**Corte:** 4 de noviembre de 2026. **Fuente:** consulta de solo lectura sobre las tablas public.skill, public.raceSkill y public.genericSkillTemplate (campo payload.effect). Consulta reproducible en scripts/audit-effect-usage.sql.

Se encontraron 26 habilidades de personajes (22 aprobadas y 4 pendientes), 21 raciales activas y 20 plantillas genéricas habilitadas: 67 definiciones con 85 instancias de efecto, de 18 tipos diferentes. El catálogo de código define 28 tipos. De las 85 instancias, 61 pertenecen a habilidades de personaje o raciales y 24 a plantillas.

## Efectos realmente utilizados

| Tipo actual | Veces | Propuesta de descomposición | Ejemplo guardado |
| --- | ---: | --- | --- |
| NARRATIVE | 24 | Descripción + referencia/capacidad opcional; no presupone ejecución | Sikatā, Fotoconstrucción |
| STAT_BONUS | 18 | Disparador + referencia estadística + suma | Reequipamiento, Paso del vendaval |
| DAMAGE_MULTIPLIER | 11 | Referencia ataque + multiplicación + daño | Alfa, Omega, Bola de fuego |
| RESOURCE_BONUS | 7 | Recurso + delta limitado por máximo | Segunda oportunidad, Curación menor |
| MAZE_TREASURE_ITEM_CHANCE | 4 | Evento tesoro + probabilidad + resultado | Mirada del sotobosque |
| CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER | 3 | Condición por ataque/elemento + multiplicador | Duramen antiguo |
| MAZE_TRAP_EVASION | 3 | Evento trampa + probabilidad + evasión | Reflejos felinos |
| STAT_MULTIPLIER | 3 | Referencia estadística + multiplicación | Capoeira, Reequipamiento |
| FINAL_DAMAGE_MULTIPLIER | 2 | Resultado posterior a defensas + multiplicador | Alfa, Omega |
| MAZE_TREASURE_MONEY_BONUS | 2 | Evento tesoro + cálculo + incremento de dinero | Instinto de las vetas |
| COPY_SKILL | 1 | Referencia habilidad + autorización/capacidad + copia | Prestamo |
| DAMAGE_REDUCTION | 1 | Daño recibido + factor reductor | Guardia corporal |
| IGNORE_MAGIC_DEF_MULTIPLIER | 1 | Defensa mágica + penetración | Alfa |
| IGNORE_PHYS_DEF_MULTIPLIER | 1 | Defensa física + penetración | Omega |
| MAGIC_REFLECTION | 1 | Impacto mágico + condición + reflejo | Espejo mágico |
| MAZE_UTILITY | 1 | Evento laberinto + capacidad temporal | Invisibilidad |
| MIRROR_RAY | 1 | Entidad invocada + ataque mágico recurrente | Espejo mágico |
| SUMMON_MIRROR | 1 | Crear entidad + ubicación + duración | Espejo mágico |

El inventario mide **uso configurado**, no prueba que cada efecto tenga un resolutor operativo en combate. Algunos mecanismos están en el campo mechanics en vez del campo effect: Resistencia no newtoniana ya incluye referencia a Sikatā, fórmula progresiva, defensa mágica dinámica y requisito de activación.

**No borrar los diez tipos del catálogo sin uso en estas tres fuentes:** podrían seguir utilizándose en objetos o perks, que necesitan su propia auditoría.

## Primera etapa implementada: núcleo aislado

El archivo lib/effects/micro-modules.ts define contenedores con identificador, nombre, tipo, descripción, disparador, requisitos, condición opcional de superficie y pasos reutilizables.

Incluye referencias numéricas tipadas a estadísticas, evento, cargas, cantidad almacenada y resultados de otros pasos; cálculos de suma/resta/multiplicación/división/mínimo/máximo/porcentaje; requisitos y condiciones; cargas individuales con capacidad configurable; consumo completo o parcial; y operaciones de curación, daño físico/mágico y modificadores.

El almacenamiento es por propietario del combatiente y clave estable, con estado específico del encuentro. El motor trabaja en una copia del estado, valida entradas, limita tamaños y comprueba el identificador de evento para evitar doble consumo en reintentos.

**Límite de esta etapa:** el nuevo evaluador todavía NO está conectado al motor actual de combate, ni al editor, ni al cálculo PCH, ni a la base de datos. Las intenciones de daño y multiplicadores NO se aplican automáticamente: un adaptador futuro deberá pasarlas por los resolutores oficiales de defensas, objetivos y áreas. La curación se calcula con tope de HP, pero todavía no se persiste en una sesión real.

## Prueba de diseño con las tres habilidades de Gloria

- **Gracia divina:** después de que el motor principal haya calculado el daño mitigado, almacena ese valor en hasta cinco cargas, cada una con cantidad propia. Mitigación cero no añade carga.
- **Santuario Interior:** sin cargas, emite un factor de resistencia 1,30; con una o más cargas, recupera el 10% del HP máximo al inicio de turno.
- **Retribución divina:** necesita al menos una carga; tras el impacto consume todas. Contra un personaje produce una intención física de 100 + STR y otra mágica de Luz del total almacenado; contra el suelo produce daño mágico de Luz en un área de radio 3 + STR / 20. El cálculo definitivo de daño, CD, PA y ES queda en el motor oficial.

Gloria está definida aquí únicamente como **fixture de pruebas**, no se han escrito habilidades nuevas en producción.

## Pendientes antes de activarlo en juego

1. Implementar adaptadores con equivalencia verificable para estadísticas, recursos, daños y resistencias existentes, conservando la semántica de potencias, orden de cálculos y costes PCH.
2. Integrar estado por sesión, eventos de daño mitigado, inicio de turno e impacto, de modo transaccional e idempotente.
3. Resolver impactos contra personaje/suelo usando defensas y áreas oficiales, no aplicando directamente daños del prototipo.
4. Crear editor de contenedores y reutilización de subefectos con protección contra ciclos.
5. Añadir transferencia entre propietarios, permisos, vínculos a otras habilidades y cálculo PCH después de validar su equivalencia.
6. Auditar perks y objetos antes de retirar tipos del catálogo.

No se han alterado habilidades, datos, ni comportamiento de combate vigente.
