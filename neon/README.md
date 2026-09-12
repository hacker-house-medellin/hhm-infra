# Neon for hacker-house-medellin

Neon is 1:1 with the GitHub org. Per the fleet ADR (`docs/db-providers-in-infra-adr.md`) Neon does **not** ingest
schema from Git: this folder declares the project, its protected default branch, roles and the `canonical` + `auth`
databases with the Neon Terraform provider, and `BRANCHING.md` describes the branch-per-PR flow.

| Path | Purpose |
| --- | --- |
| `neon/hacker-house-medellin-prod/terraform/` | pinned `kislerdm/neon` provider + lock file; project `hacker-house-medellin-prod` in `aws-us-east-2` with `prevent_destroy` |
| `BRANCHING.md` | preview branch per pull request, plan-only migrations, cleanup on close |
| `../.db-providers.json` | provider map (`neon.orgId` is the placeholder `org-pending-provider-readback` until read back) |

State: **planned**. No hacker-house-medellin Neon organization or project has been provider-verified yet, so no ID in this repo is
real. Read IDs from Neon before changing any `state` to `connected`; never guess them.

- `neon-contract.yml` runs `terraform fmt -check`, `init -backend=false -lockfile=readonly` and `validate` with no
  credentials. It never plans against, applies to, or deletes anything in Neon.
- `terraform plan/apply` is human-gated from a reviewed workstation or protected environment with `NEON_API_KEY`
  from `ores-sops`; remote state and locking follow the fleet R2 backend decision (DEN-3109) before any Git-driven apply.
- Migrations are authored in `hacker-house-medellin/hhm-lib-core` and applied by `dpm`; this repository is not a migration authority.
