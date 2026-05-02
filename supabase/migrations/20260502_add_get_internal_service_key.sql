-- Mirror of the migration applied to the Supabase project on 2026-05-02.
--
-- Why this exists: the platform-injected SUPABASE_SERVICE_ROLE_KEY env var on
-- Edge Function isolates is not a valid JWT on this project (mid-migration to
-- JWT signing keys). When daily-pipeline used Deno.env.get(...) as a Bearer
-- token to call its 7 child functions, every call 401'd with
-- UNAUTHORIZED_INVALID_JWT_FORMAT for 6 days.
--
-- The canonical legacy service_role JWT lives in vault.decrypted_secrets under
-- the name SUPABASE_SERVICE_ROLE_KEY. This RPC exposes that value to
-- service_role-authenticated callers (only) so the orchestrator can fetch the
-- canonical JWT at startup instead of trusting the broken env var.

create or replace function public.get_internal_service_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;
$$;

revoke all on function public.get_internal_service_key() from public, anon, authenticated;
grant execute on function public.get_internal_service_key() to service_role;
