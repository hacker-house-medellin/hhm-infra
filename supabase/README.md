# Supabase overlays for hacker-house-medellin

Per the fleet ADR (`ORESoftware/k8s-libs-and-shared-defs` `docs/db-providers-in-infra-adr.md`, accepted
2026-09-04) provider overlays live here, **one directory per Supabase project ref**. Each directory is a Supabase
GitHub-integration *working directory* (the parent of a `supabase/` folder holding `config.toml`, `migrations/`,
`seed.sql` and optional `functions/`). The repo-root `.db-providers.json` is the single declaration that validators
and the `*-infra` orchestration CLI read; it is validated in CI against `config/db-providers.schema.json`
(vendored from `supabase-defs/schemas/db-providers.schema.json`).

| Working directory | Role | State |
| --- | --- | --- |
| `supabase/pendingcanonicalproj` | canonical app data | planned — placeholder ref, rename to the real 20-char ref after provider read-back |
| `supabase/szzbuljocwprjhaqnbvb` | shared-auth child realm (`ores-shared-auth`) | planned — not connected |

## Near-term shared model (owner decision 2026-09-04, DEN-3146)

Supabase projects cost money, so every GitHub org currently shares the `oresoftware` Supabase org
(`zmkmcdyrryxxhleytdho`), which holds one canonical DB and one auth DB. This org is isolated by the Postgres schema
**`hacker_house_medellin`**. Every migration in these overlays must stay inside `hacker_house_medellin`; the first migration creates it and
revokes client-role access. `migrationTarget: own-org-later` is the planned move to a per-org Supabase org, which
must be a runtime-config change (`*-lib-core` RuntimeConfig / `.cli-flags.toml`), never an application code change.

## GitOps rules

- **Authority does not move.** Portable SQL and JSON Schema stay in `hacker-house-medellin/hhm-lib-core` (lib-core tier).
  Only Supabase-specific overlays (RLS, grants, Auth/Storage/Realtime settings, reviewed Edge Functions) go here.
- **Append-only migrations** named `<UTC yyyymmddhhmmss>_<snake_name>.sql`. Never edit an applied migration.
- **CI validates, providers deploy.** `supabase-contract.yml` checks the provider map, TOML, migration naming and
  namespace scoping without credentials. The Supabase GitHub App is configured with "Supabase changes only" ON and
  "Deploy to production" OFF until branch protection, a no-op preview, and provider read-back are recorded.
- **Never enable production deploy for `szzbuljocwprjhaqnbvb` from this repo.** It is a shared project; its `config.toml`
  here exists only so preview branches can boot. Shared Auth configuration is owned by `shared-auth`.
- **No secrets in Git.** Access tokens, service-role/anon keys, JWT secrets and DB URLs come from `ores-sops`
  encrypted env material or provider-managed secrets only.
- Do not invent project refs. Replace `pendingcanonicalproj` only with a ref read back from the Supabase API.
