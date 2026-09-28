alter table "public"."user"
  add column "lastLoginAt" timestamp(3) with time zone,
  add column "lastLoginSessionId" text;

create index "user_lastLoginAt_idx"
  on "public"."user" ("lastLoginAt");
