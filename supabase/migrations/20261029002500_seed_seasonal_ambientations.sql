insert into public.seasonal_ambientations (name,enabled,layers)
select 'Halloween',false,'[{"id":"base-halloween-1","imageUrl":"/ambientations/halloween.svg","position":"top-left","width":230,"opacity":85,"animation":"swing"},{"id":"base-halloween-2","imageUrl":"/ambientations/halloween.svg","position":"top-right","width":230,"opacity":85,"animation":"swing"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Halloween');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Navidad',false,'[{"id":"base-navidad-1","imageUrl":"/ambientations/navidad.svg","position":"top-left","width":230,"opacity":85,"animation":"float"},{"id":"base-navidad-2","imageUrl":"/ambientations/navidad.svg","position":"top-right","width":230,"opacity":85,"animation":"float"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Navidad');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Primavera',false,'[{"id":"base-primavera-1","imageUrl":"/ambientations/primavera.svg","position":"top-left","width":230,"opacity":85,"animation":"float"},{"id":"base-primavera-2","imageUrl":"/ambientations/primavera.svg","position":"top-right","width":230,"opacity":85,"animation":"float"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Primavera');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Otoño',false,'[{"id":"base-otono-1","imageUrl":"/ambientations/otono.svg","position":"top-left","width":230,"opacity":85,"animation":"fall"},{"id":"base-otono-2","imageUrl":"/ambientations/otono.svg","position":"top-right","width":230,"opacity":85,"animation":"fall"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Otoño');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Verano',false,'[{"id":"base-verano-1","imageUrl":"/ambientations/verano.svg","position":"top-left","width":230,"opacity":85,"animation":"pulse"},{"id":"base-verano-2","imageUrl":"/ambientations/verano.svg","position":"top-right","width":230,"opacity":85,"animation":"pulse"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Verano');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Luna de sangre',false,'[{"id":"base-luna-1","imageUrl":"/ambientations/luna.svg","position":"top-left","width":230,"opacity":85,"animation":"pulse"},{"id":"base-luna-2","imageUrl":"/ambientations/luna.svg","position":"top-right","width":230,"opacity":85,"animation":"pulse"}]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Luna de sangre');
insert into public.seasonal_ambientations (name,enabled,layers)
select 'Original',false,'[]'::jsonb
where not exists (select 1 from public.seasonal_ambientations where name='Original');
