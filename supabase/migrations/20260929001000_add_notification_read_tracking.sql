alter table "public"."user"
  add column if not exists "lastNotificationReadAt" timestamp(3) with time zone;

create index if not exists "user_lastNotificationReadAt_idx"
  on "public"."user" ("lastNotificationReadAt");
