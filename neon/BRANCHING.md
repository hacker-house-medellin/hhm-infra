# Neon branch-per-PR flow for hacker-house-medellin

1. A pull request touching `neon/**` or `.db-providers.json` triggers `.github/workflows/neon-preview.yml`.
2. If the repository secret `NEON_API_KEY` **and** the repository variable `NEON_PROJECT_ID` are both set, the
   workflow creates the Neon branch `preview/pr-<number>` from the protected default branch. If either is missing
   (the default today) the job prints a notice and exits successfully without contacting Neon.
3. Schema changes are exercised on that branch with `dpm plan` only; apply to the default branch stays human-gated.
4. When the pull request closes (merged or not) the same workflow deletes `preview/pr-<number>`.
5. Branch names never carry secrets or user data. Connection strings are never printed or stored as artifacts.

Activation checklist (operator, no agent credentials): read back the Neon org/project IDs, update
`.db-providers.json` and `terraform` inputs, protect `main` with the contract checks required, then add
`NEON_API_KEY` (least-privilege project key) as a secret and `NEON_PROJECT_ID` as a variable.
