-- Initial generic world-infrastructure roster. All records remain drafts and planned.
-- No business is assigned by default; associations can be added per node in management.
WITH nodes(code, name, kind, city, description, construction, history, details) AS (
  VALUES
  ('RNL-T01','Aguja del Primer Fuego','TOWER','Agnikota','Torre regional de infraestructura.','Obsidiana laminada y cobre conductor','Nació para coordinar a los vigías durante una erupción que cortó los caminos.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T02','Puente de la Bruma','TOWER','Dhumasetu','Torre regional de infraestructura.','Pilares de basalto con filamentos de vapor','Se levantó tras la desaparición de una caravana en una niebla de ceniza.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T03','Campana del Azafrán','TOWER','Kesarigrama','Torre regional de infraestructura.','Cerámica refractaria y anillos de latón','Sus primeros patrones de señal surgieron de la resonancia de hornos tintoreros.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T04','Monolito Carmesí','TOWER','Raktashila','Torre regional de infraestructura.','Piedra ferrosa y cristal rojo','Se construyó tras un conflicto minero para reducir rumores y falsas órdenes.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T05','Umbral de Piedra','TOWER','Shiladvara','Torre regional de infraestructura.','Bloques tallados y conductos de mica','Convierte ecos subterráneos en señales legibles; no es un portal.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T06','Copa de Cobre','TOWER','Tamravan','Torre regional de infraestructura.','Árboles metálicos y cobre patinado','Sus cimientos se diseñaron para respetar las raíces sagradas.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T07','Faro de la Forja','TOWER','Vahnipura','Torre regional de infraestructura.','Acero oscuro y núcleo térmico','Coordina talleres y convoyes; advierte de interferencias volcánicas.', '{"region":"Agnivarta"}'::jsonb),
  ('RNL-T08','Columna del Horizonte','TOWER','Anantaksetra','Torre regional de infraestructura.','Arenisca clara y espejos solares','Su primera red unió asentamientos agrícolas durante una sequía.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T09','Hito de los Caminos','TOWER','Haripatha','Torre regional de infraestructura.','Piedra fluvial y discos resonantes','Mensajeros rivales acordaron aquí una frecuencia común.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T10','Campanario de la Concordia','TOWER','Nandigrama','Torre regional de infraestructura.','Madera sagrada y bronce','Los mediadores donaron campanas con sellos para detectar suplantaciones.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T11','Loto de Cristal','TOWER','Padmavati','Torre regional de infraestructura.','Cristal lechoso y cerámica azul','Se diseñó alrededor de un estanque ceremonial y filtra interferencias.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T12','Prisma de las Siete Gemas','TOWER','Ratnapura','Torre regional de infraestructura.','Cristales facetados y plata','Comerciantes financiaron siete canales paralelos para dar redundancia.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T13','Aguja del Mediodía','TOWER','Suryanagara','Torre regional de infraestructura.','Piedra dorada y oro alquímico','Su reloj de luz estableció el primer estándar horario compartido.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T14','Observatorio de la Palabra','TOWER','Vidyasthala','Torre regional de infraestructura.','Pizarra negra y lentes de cuarzo','Su archivo de firmas ayuda a distinguir mensajes auténticos.', '{"region":"Suryakhand"}'::jsonb),
  ('RNL-T15','Torre del Sendero Vivo','TOWER','Ashvamedha','Torre regional de infraestructura.','Madera petrificada y fibras luminosas','Conecta exploradores sin abrir claros; sus antenas siguen los árboles.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T16','Espejo de Luna','TOWER','Chandrakuta','Torre regional de infraestructura.','Piedra plateada y cristal frío','Fue reconstruida para calibrar retrasos de señal durante eclipses.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T17','Espiral de Raíces','TOWER','Kundalavana','Torre regional de infraestructura.','Raíces protegidas, resina y cobre','Un pacto con custodios del bosque hizo que la torre se adaptara al terreno.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T18','Pluma del Pavo Real','TOWER','Mayuraksha','Torre regional de infraestructura.','Cerámica iridiscente y mica','Separa canales de emergencia, comercio y avisos civiles.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T19','Aguja del Lago Azul','TOWER','Nilasaras','Torre regional de infraestructura.','Piedra lacustre y cristal de agua','Un observatorio de niveles de agua se convirtió en repetidor.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T20','Vigía del Crepúsculo','TOWER','Nishapura','Torre regional de infraestructura.','Basalto oscuro y vidrio volcánico','Mantiene un canal de socorro independiente de la red comercial.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T21','Árbol de las Voces','TOWER','Vanamati','Torre regional de infraestructura.','Madera viva consagrada y cobre flexible','Se integra en un árbol monumental protegido por la comunidad.', '{"region":"Nirjaloka"}'::jsonb),
  ('RNL-T22','Ancla del Alba','TOWER','Arunima','Torre regional de infraestructura.','Cristal flotante y anillos de contención','Su pulso de posición ayuda a seguir el desplazamiento de la isla.', '{"region":"Jyotidvipa","mobile":true}'::jsonb),
  ('RNL-T23','Aguja de la Tormenta','TOWER','Tarakapura','Torre regional de infraestructura.','Metal ligero y aisladores de nube','Se construyó para avisar de descargas arcanas durante tormentas.', '{"region":"Meghapuri","mobile":true}'::jsonb),
  ('RNL-T24','Mástil de las Corrientes','TOWER','Ambaravati','Torre regional de infraestructura.','Aleación ligera y velas resonantes','Recalibra su orientación según las corrientes mágicas del continente flotante.', '{"region":"Vayumandala","mobile":true}'::jsonb),
  ('RNL-T25','Campanario Celeste','TOWER','Gaganeshvara','Torre regional de infraestructura.','Piedra hueca y anillos de viento','Advierte cuando una ciudad vecina deriva fuera de alcance.', '{"region":"Vayumandala","mobile":true}'::jsonb),
  ('RNL-T26','Lanza del Viento','TOWER','Vayusena','Torre regional de infraestructura.','Metal flexible y cristal de presión','Pilotos de corrientes la fundaron para mantener contacto entre asentamientos móviles.', '{"region":"Vayumandala","mobile":true}'::jsonb)
)
INSERT INTO public."worldInfrastructure"
  ("code","name","kind","worldLocationId","businessId","description","foundingHistory","constructionType","coverage","details","operationalStatus","publicationStatus","createdAt","updatedAt")
SELECT n.code, n.name, n.kind, city.id, NULL, n.description, n.history, n.construction,
       '{}'::jsonb, n.details || jsonb_build_object('city', n.city, 'businessAssociation', 'optional'),
       'PLANNED', 'DRAFT', now(), now()
FROM nodes n
JOIN public."worldLocation" city ON city.name = n.city AND city.type = 'CITY'
ON CONFLICT ("code") DO NOTHING;

INSERT INTO public."worldInfrastructure"
  ("code","name","kind","worldLocationId","businessId","description","foundingHistory","constructionType","coverage","details","operationalStatus","publicationStatus","createdAt","updatedAt")
VALUES
('RNL-OJO-01','Nayana','ORBITAL_SATELLITE',NULL,NULL,'Satélite de infraestructura para sincronización horaria y referencia de señal.','Conserva el pulso común y ayuda a detectar marcas temporales alteradas.',NULL,'{}'::jsonb,'{"primaryFunction":"time synchronization","orbit":"unassigned"}'::jsonb,'PLANNED','DRAFT',now(),now()),
('RNL-OJO-02','Drishti','ORBITAL_SATELLITE',NULL,NULL,'Satélite de infraestructura para observar corrientes mágicas.','Detecta tormentas, eclipses y zonas de interferencia.',NULL,'{}'::jsonb,'{"primaryFunction":"arcane weather observation","orbit":"unassigned"}'::jsonb,'PLANNED','DRAFT',now(),now()),
('RNL-OJO-03','Akshi','ORBITAL_SATELLITE',NULL,NULL,'Satélite de infraestructura para redundancia y almacenamiento temporal.','Conserva fragmentos cifrados de mensajes críticos cuando hay aislamiento.',NULL,'{}'::jsonb,'{"primaryFunction":"redundancy and temporary storage","orbit":"unassigned"}'::jsonb,'PLANNED','DRAFT',now(),now()),
('RNL-OJO-04','Prabha','ORBITAL_SATELLITE',NULL,NULL,'Satélite de infraestructura para retransmisión intercontinental.','Reenvía tráfico entre torres separadas por mares o corrientes cambiantes.',NULL,'{}'::jsonb,'{"primaryFunction":"intercontinental relay","orbit":"unassigned"}'::jsonb,'PLANNED','DRAFT',now(),now()),
('RNL-SEDE-GLOBAL','Casa del Pulso Común','GLOBAL_HEADQUARTERS',NULL,NULL,'Sede global; ubicación canónica aún pendiente.','Se fundó tras una crisis de mensajes contradictorios para coordinar estándares y mantenimiento.',NULL,'{}'::jsonb,'{"locationPending":true}'::jsonb,'PLANNED','DRAFT',now(),now())
ON CONFLICT ("code") DO NOTHING;
