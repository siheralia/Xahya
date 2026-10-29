-- Audit every newly accrued salary in the same transaction.
-- This trigger fires only for successful INSERTs, never for ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.audit_role_salary_accrual()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 INSERT INTO "AuditLog" ("actorUserId",action,"entityType","entityId","targetUserId",details,"createdAt")
 VALUES (NULL,'ROLE_SALARY_ACCRUAL','ROLE_SALARY_ACCRUAL',NULL,NEW."userId",
 jsonb_build_object('accrualId',NEW.id,'roleId',NEW."roleId",'salaryDate',NEW."salaryDate",
 'pts',NEW.pts,'karma',NEW.karma,'money',NEW.money)::text,now());
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_role_salary_accrual_insert ON "RoleSalaryAccrual";
CREATE TRIGGER audit_role_salary_accrual_insert AFTER INSERT ON "RoleSalaryAccrual"
FOR EACH ROW EXECUTE FUNCTION public.audit_role_salary_accrual();
