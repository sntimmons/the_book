-- =============================================================================
-- Security Batch 2b (correction): revoke anon EXECUTE on the contract storage
-- helpers. Supabase's default function ACL auto-grants EXECUTE to anon at CREATE
-- time, so 20260829060000's `revoke all from public` did not remove the explicit
-- anon grant. The storage SELECT policies are TO authenticated, so anon never
-- needs these helpers. Effect after this migration: anon=false, authenticated
-- and service_role keep EXECUTE, PUBLIC remains revoked.
-- =============================================================================
revoke execute on function public.can_read_contract_pdf(text) from anon;
revoke execute on function public.can_read_contract_signature(text) from anon;
