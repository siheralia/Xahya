-- Atomic wallet operations. SECURITY INVOKER: only trusted server database role may call.
CREATE OR REPLACE FUNCTION public.accrue_role_salary(p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE n integer;
BEGIN
  IF p_day > (now() AT TIME ZONE 'America/Chihuahua')::date THEN RAISE EXCEPTION 'FUTURE_SALARY_DATE'; END IF;
  WITH inserted AS (
    INSERT INTO "RoleSalaryAccrual" ("userId","roleId","salaryDate",pts,karma,money)
    SELECT a."userId", a."roleId", p_day, r."dailyPts",r."dailyKarma",r."dailyMoney"
    FROM "UserManagedRole" a JOIN "ManagedRole" r ON r.id=a."roleId"
    JOIN "User" u ON u.id=a."userId"
    WHERE u.role NOT IN ('BANNED','SYSTEM') AND (a."assignedAt" AT TIME ZONE 'America/Chihuahua')::date <= p_day
    ON CONFLICT ("userId","roleId","salaryDate") DO NOTHING
    RETURNING *
  ), sums AS (
    SELECT "userId",sum(pts)::bigint pts,sum(karma)::bigint karma,sum(money)::bigint money
    FROM inserted GROUP BY "userId"
  ), credited AS (
    INSERT INTO "UserSalaryWallet" ("userId",pts,karma,money)
    SELECT "userId",pts,karma,money FROM sums
    ON CONFLICT ("userId") DO UPDATE SET
      pts="UserSalaryWallet".pts+EXCLUDED.pts,
      karma="UserSalaryWallet".karma+EXCLUDED.karma,
      money="UserSalaryWallet".money+EXCLUDED.money,
      "updatedAt"=now()
    RETURNING "userId"
  )
  , audited AS (
    INSERT INTO "AuditLog" ("actorUserId",action,"entityType","entityId","targetUserId",details,"createdAt")
    SELECT NULL,'ROLE_SALARY_ACCRUAL','USER',i."userId",i."userId",
      jsonb_build_object('roleId',i."roleId",'salaryDate',i."salaryDate",
      'pts',i.pts,'karma',i.karma,'money',i.money)::text,now()
    FROM inserted i
    RETURNING id
  )
  SELECT (SELECT count(*) FROM audited) INTO n;
  RETURN n;
END $$;

-- Called only after authenticating user and validating their identity server-side.
-- Audit insertion participates in the same transaction as both balance updates.
CREATE OR REPLACE FUNCTION public.transfer_role_salary(
 p_user_id integer, p_character_id integer, p_pts bigint, p_karma bigint,
 p_money bigint, p_request_key uuid
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE w "UserSalaryWallet"%ROWTYPE; c "CharacterResource"%ROWTYPE;
 t_id bigint; existing "SalaryTransfer"%ROWTYPE;
BEGIN
 IF p_request_key IS NULL OR p_pts IS NULL OR p_karma IS NULL OR p_money IS NULL
 OR p_pts < 0 OR p_karma < 0 OR p_money < 0
 OR (p_pts=0 AND p_karma=0 AND p_money=0)
 OR p_pts > 2147483647 OR p_karma > 2147483647 OR p_money > 2147483647
 THEN RAISE EXCEPTION 'INVALID_TRANSFER'; END IF;
 SELECT * INTO existing FROM "SalaryTransfer" WHERE "requestKey"=p_request_key;
 IF FOUND THEN
   IF existing."userId"<>p_user_id OR existing."characterId"<>p_character_id
     OR existing.pts<>p_pts OR existing.karma<>p_karma OR existing.money<>p_money
   THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'; END IF;
   RETURN existing.id;
 END IF;
 -- Serialize all transfers for the same user, including distinct request keys.
 SELECT * INTO w FROM "UserSalaryWallet" WHERE "userId"=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_MISSING'; END IF;
 SELECT * INTO existing FROM "SalaryTransfer" WHERE "requestKey"=p_request_key;
 IF FOUND THEN RETURN existing.id; END IF;
 IF w.pts<p_pts OR w.karma<p_karma OR w.money<p_money THEN RAISE EXCEPTION 'INSUFFICIENT_WALLET'; END IF;
 PERFORM 1 FROM "Character" WHERE id=p_character_id AND "userId"=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_NOT_OWNED'; END IF;
 SELECT * INTO c FROM "CharacterResource" WHERE "characterId"=p_character_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_RESOURCE_MISSING'; END IF;
 IF c."levelUpPoints"::bigint+p_pts>2147483647 OR c.karma::bigint+p_karma>2147483647
 OR c.money::bigint+p_money>2147483647 THEN RAISE EXCEPTION 'RESOURCE_OVERFLOW'; END IF;
 UPDATE "UserSalaryWallet" SET pts=pts-p_pts,karma=karma-p_karma,money=money-p_money,"updatedAt"=now() WHERE "userId"=p_user_id;
 UPDATE "CharacterResource" SET "levelUpPoints"="levelUpPoints"+p_pts::integer,
 karma=karma+p_karma::integer,money=money+p_money::integer WHERE id=c.id;
 INSERT INTO "SalaryTransfer" ("requestKey","userId","characterId",pts,karma,money,"balanceBefore","balanceAfter")
 VALUES (p_request_key,p_user_id,p_character_id,p_pts,p_karma,p_money,
 jsonb_build_object('pts',w.pts,'karma',w.karma,'money',w.money),
 jsonb_build_object('pts',w.pts-p_pts,'karma',w.karma-p_karma,'money',w.money-p_money))
 RETURNING id INTO t_id;
 INSERT INTO "AuditLog" ("actorUserId",action,"entityType","entityId","characterId","targetUserId",details,"createdAt")
 VALUES (p_user_id,'ROLE_SALARY_TRANSFER','SALARY_TRANSFER',NULL,p_character_id,p_user_id,
 jsonb_build_object('transferId',t_id,'requestKey',p_request_key,'pts',p_pts,'karma',p_karma,'money',p_money,
 'walletBefore',jsonb_build_object('pts',w.pts,'karma',w.karma,'money',w.money),
 'walletAfter',jsonb_build_object('pts',w.pts-p_pts,'karma',w.karma-p_karma,'money',w.money),
 'characterBefore',jsonb_build_object('pts',c."levelUpPoints",'karma',c.karma,'money',c.money),
 'characterAfter',jsonb_build_object('pts',c."levelUpPoints"+p_pts,'karma',c.karma+p_karma,'money',c.money+p_money))::text,now());
 RETURN t_id;
END $$;
REVOKE ALL ON FUNCTION public.accrue_role_salary(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_role_salary(integer,integer,bigint,bigint,bigint,uuid) FROM PUBLIC;

-- PostgREST service-role calls must retain EXECUTE after PUBLIC revocation.
GRANT EXECUTE ON FUNCTION public.accrue_role_salary(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_role_salary(integer,integer,bigint,bigint,bigint,uuid) TO service_role;
