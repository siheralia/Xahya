-- Public karma ranking: characters who own this item are omitted from the public top 3.
insert into public."item" (
  "name",
  "description",
  "itemType",
  "itemSubtype",
  "acquisitionType",
  "price",
  "effects",
  "allowedSlots"
)
select
  'Velo de Karma',
  'Oculta a tu personaje del ranking público de karma mientras tengas este objeto en tu inventario.',
  'OTHER',
  'KARMA_VEIL',
  'PURCHASABLE',
  1000,
  '[]'::jsonb,
  '[]'::jsonb
where not exists (
  select 1 from public."item" where "itemSubtype" = 'KARMA_VEIL'
);
