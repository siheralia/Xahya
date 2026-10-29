-- Accrual function already inserts one AuditLog row per newly accrued salary.
-- Do not install a second trigger: that would duplicate every audit event.
DROP TRIGGER IF EXISTS audit_role_salary_accrual_insert ON "RoleSalaryAccrual";
DROP FUNCTION IF EXISTS public.audit_role_salary_accrual();
