# Xahya — Órbitas sonoras (partituras)

Ruta: `/musica-orbital` (requiere iniciar sesión).

## Notas y recorridos

- 16 círculos, de Do4 a Do6 (afinación temperada, La4 = 440 Hz), incluyendo Fa♯5.
- Más lejos del centro = sonido más agudo.
- Cada anillo tiene **su propia duración de vuelta (2–30 segundos) y dirección**. La velocidad y el sentido controlan realmente cuándo se disparan sus notas, no solo el SVG.
- Cada anillo se puede activar/desactivar sin perder sus notas, retrasar su inicio de 0 a 30 segundos y configurar su posición angular.
- Cada órbita admite un **instrumento independiente**, a elegir entre sintetizador, cuerdas tipo violín, bajo profundo y pulso retro de jefe. La selección se guarda en el JSON y controla el sonido real.
- Los controles angulares se despliegan desde **Ajustar** en cada anillo para simplificar la interfaz.

## Guardar, importar y exportar

- **Guardar aquí** almacena la partitura mediante `localStorage`, solo en ese navegador y dispositivo.
- **Cargar** y **Borrar guardada** operan sobre las partituras guardadas en el navegador.
- **Exportar JSON** descarga notas, alturas por círculo, encendidos, fases, retrasos y los dos recorridos.
- **Importar partitura JSON** aplica el archivo, pero no lo guarda hasta pulsar **Guardar aquí**.
- La importación valida formato, versión, rangos de ángulos y grupos, notas duplicadas y un máximo de 1 MB por archivo.
- No se han añadido tablas ni datos de usuario en el servidor.

Formato `xahya-orbital-score` versión 1: `format`, `version`, `title`, `groups` (se mantienen como configuración de respaldo de archivos antiguos), `percussion: "boss" | "orchestral" | "battle" | "none"` y `rings` (cada anillo incluye `pitch`, `enabled`, `phase`, `delay`, `duration`, `direction`, `instrument`, `angles` y `slides`). Se identifican los anillos por `pitch`, para admitir archivos anteriores con menos anillos. Si un archivo antiguo no contiene `duration`/`direction` por anillo, se heredan del grupo; si no contiene `percussion`, se asume `"none"`; si no indica `instrument`, el anillo mantiene el timbre `"synth"` anterior.

## Melodía proporcionada

El botón **Cargar melodía proporcionada · 53 notas** distribuye las seis frases de notas suministradas por la usuaria en 65 posiciones temporales; 53 tienen notas, con dos posiciones vacías entre frases y una al principio y al final.

Asignación provisional: La4, Si4, Do5, Re5, Mi5, Fa♯5, Sol5. Ambas familias giran en sentido horario, con duración de 16 segundos por vuelta, fase e inicio 0°. Así la secuencia suena en orden. Como las letras de notas no especifican octavas, tempo, silencios exactos o duración individual, es una **aproximación editable**, no una transcripción rítmica exacta.

La partitura puede guardarse y exportarse como cualquier otra composición. No se almacena audio.

## Tema épico de Xahya: Corazón del Abismo — jefe

**Corazón del Abismo — jefe** es un **tema completamente original** de combate contra jefe, inspirado en la energía del sonido retro sin reproducir melodías conocidas. El período es de **12 segundos (8 compases de 4/4 a 160 BPM)**. Usa un motivo angular en modo Mi frigio, con cambios de registro, notas rápidas y pequeños silencios, en lugar de las frases demasiado continuas o pausadas de las versiones anteriores.

La melodía incluye **48 ataques de pulso electrónico por vuelta**: el nuevo instrumento **Pulso de jefe · distorsión retro** combina onda cuadrada, armónico ligeramente desafinado, filtro y saturación suave; las notas tienen ataque inmediato y final breve. El bajo profundo usa la fundamental y una suboctava, con raíces y quintas en los tiempos fuertes (48 ataques por vuelta). Los dos anillos de cuerdas aportan cuatro acordes sostenidos y dos golpes cromáticos de Fa♯5; este último gira cada 6 segundos y se repite dentro del período general de 12 segundos. El final Fa5 se desliza brevemente al Mi5 del principio para conectar las vueltas.

La nueva opción **Jefe · batería rock** marca la caja en los tiempos **2 y 4**, con bombo en 1 y 3, pequeños anticipos al final de algunas frases y platos en las entradas de sección. No usa el patrón de timbales o de contratiempos que podía sonar bailable. Las opciones anteriores **Orquestal · timbales**, **Marcial · batería** y silencio permanecen disponibles para todas las partituras existentes.

Cada circunferencia conserva la edición independiente de dirección, velocidad, instrumento y deslizamientos. Las nuevas opciones de timbre (**Sintetizador**, **Cuerdas · violín**, **Bajo profundo · octava grave** y **Pulso de jefe · distorsión retro**) se guardan en el JSON v1; los archivos antiguos siguen heredando "synth" y su percusión original. La partitura de jefe nueva es un reemplazo propuesto para el tema predeterminado de sistema, no modifica por sí misma las partituras personales ya guardadas.

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

El sintetizador utiliza voces diferenciadas: graves más redondos (fundamental senoidal con subarmónico), agudos de carácter casi orquestal/retro (diente de sierra suavizado con filtro de paso bajo) y un instrumento opcional de **cuerdas con arco** (dos osciladores ligeramente desafinados, ataque progresivo, filtro dinámico, vibrato de unos 5 Hz y legato más largo). Es síntesis local, no grabaciones reales de violín. Los sonidos normales tienen articulación corta para destacar el ritmo, no colas de casi un segundo. Los glissandos sostienen su primera altura y sólo se deslizan durante los **últimos 60–140 ms** de la nota; así se conservan efectos largos personalizados sin convertirlos en sirenas. Las partituras personalizadas siguen siendo compatibles; su período de vuelta y configuración de glissandos no se alteran.

El tema de sistema mantiene un ciclo de 8 s. Si un usuario había guardado una versión anterior como **tema personal**, se conserva tal cual: debe cargar la nueva partitura del sistema y guardarla otra vez si desea adoptarla.
