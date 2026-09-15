# Existing HHAUS Supabase project `bihpugkzayenywfyajnr`

This is the existing active production Supabase project discovered in `hacker-house-medellin/hhm-supabase` and consolidated into `hhm-infra` on 2026-09-14.

Observed provider state:

- Supabase organization: `hhaus` (`zbkkhhovcgpjgfhttaii`)
- project slug: `hhaus-project`
- region: `us-east-1`
- environment: `production`
- status: `active`
- canonical in the legacy provider repository: `true`

This does **not** overwrite `.db-providers.json`. That file currently expresses the desired near-term shared-`oresoftware` topology (`pendingcanonicalproj` plus the Shared Auth child), while this directory records the existing dedicated production provider root that must be migrated or retired explicitly.

No production deployment is enabled by this consolidation. The old `hhm-supabase` repository should become read-only after parity is verified here.
