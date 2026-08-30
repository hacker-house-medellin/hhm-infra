# hhm-infra

Kubernetes, Argo CD, observability, and bounded Cloudflare Worker edge code for Hacker House Medellin.

Initialized through `DEN-1950` as a testable `infra` foundation. Product behavior continues through focused pull requests.

```bash
python3 scripts/verify_repo.py
python3 scripts/validate_routing.py
./scripts/validate.sh
```

The production hostname and trust-plane contract lives in
[`routing/hhaus-hosts.json`](routing/hhaus-hosts.json). The separately isolated
public and admin Cloudflare Tunnel gateways live in [`k8s/edge`](k8s/edge) and
remain fail-closed until the release gates in
[`docs/hhaus-routing.md`](docs/hhaus-routing.md) are satisfied.

## Environment secrets

Secrets live in this repo **encrypted** with [sops](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age):
`env/enc/<dev|prod>.env.enc` is committed; `just env-use <name>` decrypts it to
`env/dec/<name>.env` (gitignored, mode 0600) and symlinks `./.env` to it. The
Nix dev shell provides the tooling, `just env-audit` runs keyless in CI, and
containers decrypt at `docker run` — never at build. See [`env/README.md`](env/README.md).
