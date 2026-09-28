ALTER TABLE public."user" DROP CONSTRAINT IF EXISTS "user_role_check";
ALTER TABLE public."user"
ADD CONSTRAINT "user_role_check"
CHECK (role IN ('PLAYER', 'GM', 'ADMIN', 'SYSTEM'));
