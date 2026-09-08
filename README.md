# hhm-infra

Kubernetes, Argo CD, observability, and bounded Cloudflare Worker edge code for Hacker House Medellin.

Initialized through `DEN-1950` as a testable `infra` foundation. Product behavior continues through focused pull requests.

```bash
python3 scripts/verify_repo.py
python3 scripts/validate_routing.py
./scripts/validate.sh
```

The production hostname and trust-plane contract lives in
[`routing/hhaus-hosts.json`](routing/hhaus-hosts.json), while WebSocket, internal
TCP, and private admin MCP ownership lives in
[`routing/realtime-transports.json`](routing/realtime-transports.json). The sole
Cloudflare Tunnel gateway in [`k8s/edge`](k8s/edge) serves only public HTTP/WSS.
Admin web, admin API, MCP, and raw TCP have no public hostname or edge route and
remain fail-closed until the release gates in
[`docs/hhaus-routing.md`](docs/hhaus-routing.md) are satisfied.

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
