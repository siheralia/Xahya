alter table "public"."user"
  add column "lastNotificationReadAt" timestamp(3) with time zone;

create index "user_lastNotificationReadAt_idx"
  on "public"."user" ("lastNotificationReadAt");
