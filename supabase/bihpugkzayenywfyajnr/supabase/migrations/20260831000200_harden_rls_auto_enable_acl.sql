-- Supabase installs this SECURITY DEFINER event-trigger function to enable RLS
-- on newly created public tables. Event triggers invoke it internally; browser
-- roles do not need direct EXECUTE. Keep the hardening conditional so local
-- PostgreSQL verification and provider variants converge safely.

DO $harden$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$harden$;
