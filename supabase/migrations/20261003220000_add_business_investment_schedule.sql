alter table public."businessInvestment"
  add column if not exists "frequency" text not null default 'ONCE',
  add column if not exists "active" boolean not null default true;

alter table public."businessInvestment"
  drop constraint if exists "businessInvestment_frequency_check";

alter table public."businessInvestment"
  add constraint "businessInvestment_frequency_check"
  check ("frequency" in ('ONCE','WEEKLY'));

update public."businessInvestment"
set "frequency" = case when "sourceType" = 'BUSINESS' then 'WEEKLY' else 'ONCE' end;

update public."businessInvestment"
set "active" = true
where "frequency" = 'WEEKLY';

update public."businessInvestment"
set "active" = false
where "frequency" = 'ONCE';
