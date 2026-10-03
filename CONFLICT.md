# hacker-house-medellin/hhm-infra#6 — feat: add fail-closed hhaus.org edge routing

head: feat/hhaus-routing  base: main  author: ORESoftware  updated: 2026-08-31T19:47:16Z
dir: /Users/maca5/codes/.claude-fleet/scratch/merge/hacker-house-medellin_hhm-infra__6

## conflicted files
- env/README.md

## base (main) last 8 commits
a45ac49 feat(DEN-3443): declare canonical GCP target for Hacker House Medellín Rust services (#8)
a9f23f5 Merge pull request #5 from hacker-house-medellin/agent/ores-sops-ensure-dec-20260828b
610b74a Refuse unguarded env/dec mkdir before ores-sops.
d967db0 Merge the two parallel sops+just+nix rollouts (semantic merge)
97432b3 feat(env): adopt fleet-wide sops+age encrypted env files (just + nix)
a614e32 feat(env): adopt sops+just+nix encrypted environment workflow
b5fae0a Merge branch 'main' of github.com:hacker-house-medellin/hhm-infra
43a8d16 Merge branch 'main' of https://github.com/hacker-house-medellin/hhm-infra

## head (feat/hhaus-routing) last 8 commits
085c0d3 feat: stage isolated admin runtime secrets
ee0c70c feat: stage fail-closed HHaus runtimes
201a702 fix: route edge to canonical Rust runtimes
9758455 fix: align runtime service listener ports
1d1a581 fix: route admin edge to deployed services
2a8538c fix: keep secrets audit key-independent
f065396 docs: reconcile global city routing
c347256 feat: add fail-closed hhaus edge routing

## merge-base: a9f23f5f795c8fae90119412c920b94736d7a790

## PR diff stat (merge-base..head)
 .github/workflows/ci.yml                |   1 +
 .just/env.just                          |   2 +-
 README.md                               |   8 ++
 docs/architecture.md                    |   9 ++
 docs/hhaus-routing.md                   | 105 +++++++++++++++++++
 env/README.md                           |   4 +-
 k8s/admin-secrets/external-secrets.yaml |  75 +++++++++++++
 k8s/admin-secrets/kustomization.yaml    |   9 ++
 k8s/admin-secrets/namespace.yaml        |   6 ++
 k8s/base/hhm-api.yaml                   |   3 +-
 k8s/base/hhm-mash-web.yaml              |   5 +-
 k8s/edge/admin-gateway.yaml             | 137 ++++++++++++++++++++++++
 k8s/edge/external-secrets.yaml          |  35 +++++++
 k8s/edge/kustomization.yaml             |  13 +++
 k8s/edge/namespace.yaml                 |   7 ++
 k8s/edge/network-policies.yaml          | 179 ++++++++++++++++++++++++++++++++
 k8s/edge/public-gateway.yaml            | 175 +++++++++++++++++++++++++++++++
 k8s/edge/tunnels.yaml                   | 125 ++++++++++++++++++++++
 k8s/runtime/config.yaml                 |  32 ++++++
 k8s/runtime/external-secrets.yaml       |  57 ++++++++++
 k8s/runtime/kustomization.yaml          |  12 +++
 k8s/runtime/namespace.yaml              |   6 ++
 k8s/runtime/network-policies.yaml       | 126 ++++++++++++++++++++++
 k8s/runtime/public-runtime.yaml         | 175 +++++++++++++++++++++++++++++++
 routing/hhaus-hosts.json                |  93 +++++++++++++++++
 scripts/validate.sh                     |   5 +
 scripts/validate_routing.py             | 112 ++++++++++++++++++++
 tests/routing.test.mjs                  |  90 ++++++++++++++++
 28 files changed, 1600 insertions(+), 6 deletions(-)

## base diff stat (merge-base..base)
 .just/env.just                     |  2 +-
 env/README.md                      |  3 +--
 gcp/fleet-rust-service-target.yaml | 44 ++++++++++++++++++++++++++++++++++++++
 3 files changed, 46 insertions(+), 3 deletions(-)

## merge output
Auto-merging env/README.md
CONFLICT (content): Merge conflict in env/README.md
Automatic merge failed; fix conflicts and then commit the result.
