# Phuture Outreach — Supabase artefacts

This directory mirrors a small, hand-curated subset of the Phuture Outreach
Supabase project (`tunlqcdgqzcpevmhneap`) so the auth fix is reviewable in git.

The full project lives in Supabase and is deployed via the Supabase CLI / MCP.
Only the files relevant to the 2026-05-02 pipeline-auth fix are mirrored here.

## What's here

- `migrations/20260502_add_get_internal_service_key.sql` — RPC that returns the
  canonical legacy `service_role` JWT from `vault.decrypted_secrets` to
  service-role callers only.
- `functions/daily-pipeline/index.ts` — the orchestrator. v5 reads the JWT
  from the vault via the RPC above (instead of trusting the platform-injected
  `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, which on this project returns a
  value that is not a valid JWT).

## The bug, in one paragraph

Project `tunlqcdgqzcpevmhneap` is mid-migration to JWT signing keys. The
reserved `SUPABASE_SERVICE_ROLE_KEY` shows a `DEPRECATED` badge in the
dashboard and the value injected into Edge Function isolates at runtime is not
a valid JWT shape (`header.payload.signature`). When `daily-pipeline` used
`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` as a `Bearer` token to call its 7
child functions (all `verify_jwt: true`), every call 401'd with
`UNAUTHORIZED_INVALID_JWT_FORMAT`. Six consecutive days of zero Gmail drafts.

## The fix

1. The legacy `service_role` JWT is stored verbatim in
   `vault.decrypted_secrets` under the name `SUPABASE_SERVICE_ROLE_KEY`.
2. `public.get_internal_service_key()` exposes that value to `service_role`
   callers (only) via PostgREST RPC.
3. `daily-pipeline` bootstraps a Supabase client with whatever
   `Deno.env.get(...)` returns (PostgREST is more permissive than the Edge
   Function gateway), calls the RPC, sanity-checks the JWT shape, then uses
   the vault-sourced JWT for every child-function `Bearer` token.
4. `daily-pipeline` also flushes progress to `pipeline_runs` after each step,
   so a run that hits the 150s wall-clock limit still leaves an audit trail.

## Verified working

- 2026-05-02 13:17:39 → 13:19:34: pipeline run `43fa619d-62e0-44b7-a503-627136436118`
- All 7 steps succeeded (discover, enrich, audit, generate-pitch,
  generate-mockup, create-gmail-draft, daily-report)
- 0 errors
- Total wall-clock: ~115 seconds with `batch_overrides: {discover:1, enrich:1, audit:1, pitch:1, mockup:1}`

## Audit of other functions

The `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` anti-pattern was unique to
`daily-pipeline`. The 12 other functions (`discover-leads`, `enrich-emails`,
`audit-website`, `generate-pitch`, `generate-mockup`, `create-gmail-draft`,
`daily-report`, `discover-leads-no-website`, `serve-mockup`,
`debug-read-mockup`, `debug-check-secrets`, `fetch-freepik-images`) use the
env var only as a PostgREST credential for their own DB reads/writes. None of
them fan out to other Edge Functions, so the broken JWT shape doesn't matter
for them — PostgREST's auth path is more permissive than the Edge Function
gateway's.
