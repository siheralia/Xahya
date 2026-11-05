# Migración modular masiva (React Flow y retorno al motor clásico)

## Objetivo y alcance

Esta entrega permite **probar simultáneamente todas las habilidades existentes** sin duplicar compras ni editar una por una. El sistema conserva las definiciones originales como respaldo y evalúa micromódulos primero cuando demuestra equivalencia numérica. Los efectos que siguen siendo declarativos o no resueltos se derivan al motor original; no se convierten en una falsa habilidad funcional.

### Editor visual
- Paquete real **@xyflow/react 12.12.1** y hoja de estilos oficial.
- Dentro del constructor de micromódulos: nodos desplazables, zoom, navegación, selección, conexiones entre salidas \`READ_STAT\`, \`READ_STORED\`, \`CONSUME\` y entradas \`base\`/\`input\` de \`VARIABLE_RESISTANCE\`.
- El usuario conecta arrastrando del nodo productor al nodo receptor. Solo se aceptan conexiones hacia pasos posteriores y desde una salida real. Los enlaces cambian directamente la expresión ejecutable \`OUTPUT\`; al desconectarlos regresan a la entrada predeterminada configurada, sin mantener un grafo de presentación paralelo.
- El comparador muestra gráficos de lectura para las 63 proyecciones y los detalles técnicos para la revisión.
- La posición visual de nodos solo dura durante la sesión; las conexiones **sí** se guardan.

### Selección global de motor
En Gestión de efectos → Copias modulares y equivalencia:
- **Priorizar módulos con respaldo** (\`MODULAR_FIRST\`, modo predeterminado): usa los valores del motor de micromódulos cuando la equivalencia con el cálculo original está confirmada. Si falta soporte, usa el resultado original.
- **Volver al cálculo original** (\`LEGACY_ONLY\`): anula la preferencia modular **para el cálculo numérico de lanzamientos de habilidades en encuentros**.
- Se almacena en \`AppSetting.skills.modular-cutover.v1\` y lo lee el servidor cuando se lanza la habilidad. El cambio afecta al siguiente lanzamiento y está protegido por \`management.effects.edit\`.
- El botón no cambia los datos de las habilidades, aprobaciones, PCH, recursos ni encuentros registrados. El original permanece inmediatamente disponible.
- Las pasivas de razas, laberinto y los resolvedores especiales ya conectados mantienen por ahora sus rutas actuales; **este interruptor no controla todos esos caminos**. Eso es una limitación explícita de la primera fase del corte masivo.

### Compatibilidad y siguientes límites

1. Los datos históricos de 63 habilidades se proyectan **en bloque** y no exigen aprobación manual individual.
2. La conversión de una descripción narrativa \`CAPABILITY\` es una representación de intención, **no** un nuevo efecto de curación, desplazamiento o daño.
3. Las habilidades \`COMPOSED\` totalmente nuevas aún requieren resolutores de combate para todos sus tipos. No se autoriza la ejecución de una capacidad no resuelta mediante cambiar el modo.
4. La ruta de rollback se basa en los datos originales, que continúan almacenados y sin modificar.
5. La activación de módulos se limita a la parte numérica demostrada; **todavía no se han sustituido todos los resolutores antiguos**. La finalización absoluta de la migración requerirá cubrir estas acciones especiales, que se podrán probar y corregir de manera grupal mediante este tablero.

## Regresión
- 63 entradas del inventario histórico sin alteración.
- Modo modular, fallback por falta de equivalencia y reversión inmediata.
- Paridad numérica de ataques, curación, defensa, duración, cooldown y costos.
- Conexiones visuales al mismo modelo ejecutable (sin Mermaid ni conexión decorativa).
- Pruebas generales de Xahya, integración PostgreSQL, TypeScript y compilación Next.js.

Para inspección manual, abrir el constructor desde Gestión de efectos, o entrar en Gestión de efectos → Copias modulares y equivalencia. La vista gráfica aparece al expandir una copia con pasos definidos.

### Aislamiento de pruebas
El modo de migración usa la clave `skills.modular-cutover.v1` en **producción** y `skills.modular-cutover.v1:preview` en **Vercel Preview o desarrollo**. Esto evita que los interruptores de la vista previa alteren el modo de producción aunque compartan una instancia de base de datos.
