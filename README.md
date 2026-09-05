# hhm-infra

Kubernetes, Argo CD, observability, and bounded Cloudflare Worker edge code for Hacker House Medellin.

Initialized through `DEN-1950` as a testable `infra` foundation. Product behavior continues through focused pull requests.

```bash
python3 scripts/verify_repo.py
```

## Environment secrets

Secrets live in this repo **encrypted** with [sops](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age):
`env/enc/<dev|prod>.env.enc` is committed; `just env-use <name>` decrypts it to
`env/dec/<name>.env` (gitignored, mode 0600) and symlinks `./.env` to it. The
Nix dev shell provides the tooling, `just env-audit` runs keyless in CI, and
containers decrypt at `docker run` — never at build. See [`env/README.md`](env/README.md).


## Database isolation tests

Run `npm ci --ignore-scripts && npm test` in [`infra-isolation/`](infra-isolation/README.md)
for the canonical/auth/admin infrastructure contract and adversarial tests.
The dedicated GitHub Actions check is offline; live isolation acceptance requires
fresh provider/AWS evidence and explicitly authorized read-only probes. Missing
projects, private endpoints, or evidence remain blocked rather than passing.
