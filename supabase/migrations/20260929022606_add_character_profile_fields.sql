alter table "public"."character"
  add column if not exists "age" integer,
  add column if not exists "gender" text,
  add column if not exists "height" integer;
