# Xahya — Órbitas sonoras (partituras)

Ruta: `/musica-orbital` (requiere iniciar sesión).

## Notas y recorridos

- 16 círculos, de Do4 a Do6 (afinación temperada, La4 = 440 Hz), incluyendo Fa♯5.
- Más lejos del centro = sonido más agudo.
- Cada anillo tiene **su propia duración de vuelta (2–30 segundos) y dirección**. La velocidad y el sentido controlan realmente cuándo se disparan sus notas, no solo el SVG.
- Cada anillo se puede activar/desactivar sin perder sus notas, retrasar su inicio de 0 a 30 segundos y configurar su posición angular.
- Los controles angulares se despliegan desde **Ajustar** en cada anillo para simplificar la interfaz.

## Guardar, importar y exportar

- **Guardar aquí** almacena la partitura mediante `localStorage`, solo en ese navegador y dispositivo.
- **Cargar** y **Borrar guardada** operan sobre las partituras guardadas en el navegador.
- **Exportar JSON** descarga notas, alturas por círculo, encendidos, fases, retrasos y los dos recorridos.
- **Importar partitura JSON** aplica el archivo, pero no lo guarda hasta pulsar **Guardar aquí**.
- La importación valida formato, versión, rangos de ángulos y grupos, notas duplicadas y un máximo de 1 MB por archivo.
- No se han añadido tablas ni datos de usuario en el servidor.

Formato `xahya-orbital-score` versión 1: `format`, `version`, `title`, `groups` (se mantienen como configuración de respaldo de archivos antiguos), `percussion: "battle" | "none"` y `rings` (cada anillo incluye `pitch`, `enabled`, `phase`, `delay`, `duration`, `direction`, `angles` y `slides`). Se identifican los anillos por `pitch`, para admitir archivos anteriores con menos anillos. Si un archivo antiguo no contiene `duration`/`direction` por anillo, se heredan del grupo; si no contiene `percussion`, se asume `"none"`.

## Orquesta polifónica y MIDI (propuesta experimental)

**Corona de Cenizas es ahora el tema predeterminado del editor y de combate**, salvo que el jugador haya guardado un tema personal. **Ascenso de Xahya** sigue disponible como alternativa y respaldo si el MIDI comprimido no puede cargarse. Las 16 órbitas clásicas se conservan en una vista alternativa.

### Órbitas instrumentales

- Las **12 pistas y 587 notas de Corona de Cenizas** se convierten en **12 anillos instrumentales interactivos**: cada círculo puede contener notas de varias alturas, acordes superpuestos y duraciones distintas.
- Hay **velocidades de 1, 2, 4 y 8 vueltas por pieza**, según el tipo de instrumento. Las cuerdas melódicas hacen una vuelta larga; bajo, guitarra, violonchelo, trémolo y batería pueden girar más rápido.
- El sistema mantiene las notas en su **vuelta original**: una nota de la segunda media vuelta no suena por accidente en la primera. Se comprueba que la conversión respete todos los inicios, duraciones, notas y velocidades MIDI.
- Cada pista guarda `orbit: { duration, direction, phase, enabled }`. Cambiar duración, sentido o fase **recalcula los tiempos de sus notas**, conservando su ángulo y vuelta, mientras la partitura sigue dentro del ciclo global. Si la modificación haría perder notas, se rechaza con una advertencia.
- Selecciona el instrumento tocando su círculo; una segunda pulsación sobre el anillo permite añadir una nota en la vuelta actual. Las notas se pueden ajustar desde **Pistas orquestales** y la vista de **Órbitas de notas (16)** permanece disponible para las partituras anteriores.
- Se corrigió la anchura móvil: contenedores flexibles con `min-w-0`, elementos que pueden envolver texto y recorte de desbordamiento horizontal, evitando que los paneles ensanchen toda la página.

La versión 1 del JSON continúa compatible; las partituras que no contienen `track.orbit` reciben un período igual al grupo principal, sentido horario y activación automática.

Esta evolución conserva las partituras JSON versión 1 y añade los mecanismos siguientes:

- **Duraciones reales por nota en cada círculo**: `ring.noteLengths: [{ angle, duration }]`, donde `duration` está entre 0,05 y 30 segundos. Las notas aparecen como **arcos** que muestran cuánto se mantienen. Una partitura antigua sin `noteLengths` conserva sus ataques cortos originales.
- **Instrumento por círculo**: `ring.instrument` opcional, predeterminado `"synth"`. Desde **Ajustar** se pueden elegir violín, conjunto de cuerdas, trompa, violonchelo, contrabajo, guitarra, coro, trémolo, timbales, metales y batería.
- **Pistas polifónicas independientes**: `tracks: [{ name, instrument, notes: [{ pitch, start, duration, velocity }] }]`. `pitch` es la altura MIDI (21–108), `start` y `duration` son segundos y `velocity` va de 1 a 127. Varias voces pueden comenzar a la vez, incluso con la misma altura; las pistas se ejecutan **simultáneamente con los círculos**.
- **Importar MIDI estándar**: lector de archivos `.mid` con mapa de tempo, múltiples pistas, cambios de instrumento GM y voces superpuestas. Cada pista se puede editar desde el panel **Pistas orquestales** con paginación para no mostrar cientos de notas juntas.
- **Preset Corona de Cenizas**: botón **Corona de Cenizas · tema predeterminado orbital**, basado en la composición original aprobada en audio. Contiene 12 pistas y 587 notas, y dura aproximadamente 28 segundos. El MIDI original (fuente de importación) está incluido como recurso estático comprimido `public/music/corona-de-cenizas.mid.gz.b64`; el navegador lo descomprime al cargar el preset. Si `DecompressionStream` no está disponible, se puede importar el archivo `.mid` manualmente.
- **Guardado por usuario**: el PUT de `/api/music-theme` admite hasta 160 KB de JSON validado; la cuenta conserva el tema personal; si no existe uno, se utiliza Corona de Cenizas.

### Reproducción y licencias

La orquesta carga, únicamente después de pulsar **Reproducir**, las muestras necesarias desde **FluidR3_GM (Frank Wen y colaboradores, CC BY 3.0)**, fuente: https://gleitz.github.io/midi-js-soundfonts/ ; licencia: https://creativecommons.org/licenses/by/3.0/ . Se usa el nombre de cada instrumento para obtener las muestras de la librería pública. No se incluyen archivos de SoundFont en el repositorio. La descarga puede tardar y necesita conexión a la red; si no se logra, el motor genera cada nota con un sintetizador local y mantiene la polifonía, aunque el timbre es menos realista. Un compresor dinámico limita la suma de muchas voces.

La duración del MIDI se respeta al reproducir y al exportar JSON. Los deslizamientos orbitales anteriores continúan funcionando. El MIDI puede contener notas graves y agudas fuera de los 16 anillos visibles; estas notas pertenecen a las pistas orquestales y **no se reubican falsamente** en el gráfico. Los tiempos originales no dependen del giro de los círculos.

Esta función no requiere migración SQL adicional ni modifica los datos de personaje o de combate. No fusionar/desplegar hasta revisar el sonido en el editor.

## Melodía proporcionada

El botón **Cargar melodía proporcionada · 53 notas** distribuye las seis frases de notas suministradas por la usuaria en 65 posiciones temporales; 53 tienen notas, con dos posiciones vacías entre frases y una al principio y al final.

Asignación provisional: La4, Si4, Do5, Re5, Mi5, Fa♯5, Sol5. Ambas familias giran en sentido horario, con duración de 16 segundos por vuelta, fase e inicio 0°. Así la secuencia suena en orden. Como las letras de notas no especifican octavas, tempo, silencios exactos o duración individual, es una **aproximación editable**, no una transcripción rítmica exacta.

La partitura puede guardarse y exportarse como cualquier otra composición. No se almacena audio.

## Tema épico de Xahya

**Ascenso de Xahya — batalla** es la composición predeterminada. Tiene **8 segundos por ciclo**, melodía original de fantasía oscura con voces sincopadas, bajo marcial y una progresión La menor → Sol → Fa → Mi menor. El último Si5 se desliza a Do6 y enlaza con el primer Do6 del siguiente ciclo; el bajo resuelve de Mi a La. El acompañamiento de percusión sintetizada es opcional y recorre la misma vuelta de 8 segundos.

La partitura demuestra movimiento independiente real: Re4 gira en 4 segundos, Fa♯5 en 16, los demás en 8, y varias órbitas giran en sentido antihorario. Las notas están colocadas en ángulos calculados para conservar la secuencia completa **cada 8 segundos**, incluso con revoluciones diferentes. Un anillo lento repite su motivo en puntos opuestos; uno rápido reitera un ostinato. El usuario puede editar libremente cada velocidad y sentido (ello modifica el ritmo). Los tres deslizamientos audibles por vuelta duran 0,14 segundos y son de un solo semitono. Su sonido hace una transición breve al final de una nota sostenida, evitando los largos barridos que sonaban artificiales.

Los deslizamientos son notas existentes ampliadas con una lista opcional `slides: [{ angle, toPitch, duration }]` por circunferencia. La duración es de 0,1 a 3 segundos; el origen siempre debe corresponder a una nota real. Los ejemplos de batalla usan 0,14 s para un portamento sutil. En el gráfico se dibuja un arco luminoso desde el origen hasta el anillo de destino y un marcador lo recorre durante la reproducción. El oscilador cambia continuamente de frecuencia, en vez de disparar dos notas separadas.

El formato **sigue siendo versión 1**: partituras antiguas sin `slides` se importan sin efectos deslizantes, y sin ajustes de giro individuales se usa el recorrido original.

## Tema personal de cada jugador

La nueva ruta protegida `/api/music-theme` permite a cada usuario autenticado:
- GET: leer exclusivamente su partitura personal.
- PUT: guardar la partitura que edita en el laboratorio (reemplaza el tema personal).
- DELETE: volver a utilizar el tema épico predeterminado.

Los borradores múltiples del laboratorio siguen viviendo en `localStorage`. La composición marcada **Guardar como mi tema** se guarda en el perfil y se puede usar al iniciar sesión en otro dispositivo. Para ello se añade `User.musicTheme Json?` al contrato y la migración `migrations/20261107223000_user_orbital_music_theme.sql`. **La migración debe aplicarse a la base de datos antes de publicar esta PR**.

## Música durante combates

El acceso al editor está en **Mi perfil → Mi tema musical de combate → Abrir editor musical**. El tema personal se guarda por **cuenta**, no por personaje, de modo que el mismo tema puede seleccionarse al combatir con distintos personajes. La ficha de personaje no necesita un acceso adicional.

El encuentro incluye un panel **Música** para elegir entre Ascenso de Xahya y el tema personal del jugador, pulsar reproducir/pausar y ajustar el volumen, **sin enlazar al editor durante el combate**. La reproducción no empieza automáticamente: requiere una interacción explícita por las restricciones de audio de los navegadores. Se detiene al finalizar el combate o abandonar la página, no utiliza la API de combate y no modifica PA, maná, ticks, el orden de iniciativa ni las acciones.

### Timbre y notas de transición

El sintetizador utiliza voces diferenciadas: graves más redondos (fundamental senoidal con subarmónico), agudos de carácter casi orquestal/retro (diente de sierra suavizado con filtro de paso bajo). Los sonidos normales tienen articulación corta para destacar el ritmo, no colas de casi un segundo. Los glissandos sostienen su primera altura y sólo se deslizan durante los **últimos 60–140 ms** de la nota; así se conservan efectos largos personalizados sin convertirlos en sirenas. Las partituras personalizadas siguen siendo compatibles; su período de vuelta y configuración de glissandos no se alteran.

El tema de sistema mantiene un ciclo de 8 s. Si un usuario había guardado una versión anterior como **tema personal**, se conserva tal cual: debe cargar la nueva partitura del sistema y guardarla otra vez si desea adoptarla.
