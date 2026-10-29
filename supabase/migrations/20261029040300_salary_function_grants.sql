-- The API uses the server-side service_role key. Functions must not be callable by anon/authenticated.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_role_salary(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_role_salary(integer,integer,bigint,bigint,bigint,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.accrue_role_salary(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_role_salary(integer,integer,bigint,bigint,bigint,uuid) FROM anon, authenticated;
