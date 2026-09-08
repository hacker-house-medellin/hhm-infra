# `hhaus.org` routing and release gates

`routing/hhaus-hosts.json` is the machine-readable public-hostname contract.
`routing/realtime-transports.json` is the transport and ownership contract for
WebSocket, raw TCP, and admin-to-MCP communication. The manifests in `k8s/edge`
deliberately contain no public `LoadBalancer`, `NodePort`, or `Ingress`; the
single public plane establishes an outbound Cloudflare Tunnel connection.

## Public HTTP and WebSocket plane

The public connector may reach only `hhm-public-gateway`. The gateway serves:

- `user.hhaus.org` through Kubernetes workload `hhm-web` on port 8081;
- `api.hhaus.org` through Kubernetes workload `hhm-api` on port 8080; and
- exactly five browser-safe Shared Auth routes on `auth.hhaus.org`, also
  available under the same-origin `/shared-auth-ui` prefix on the user host.

Delegation, introspection, exchange, metrics, and every other Shared Auth path
return 404 at the gateway. Unknown hostnames return 421.

WebSocket upgrade is narrower than the ordinary HTTP application surface. Only
three exact paths may receive the hop-by-hop `Upgrade` and `Connection` headers:

| Public host | Exact path | Kubernetes upstream | Application owner |
| --- | --- | --- | --- |
| `user.hhaus.org` | `/ws` | `hhm-web.hhm.svc.cluster.local:8081` | `hacker-house-medellin/hhm-web-server.rs` |
| `user.hhaus.org` | `/ws/chat` | `hhm-web.hhm.svc.cluster.local:8081` | `hacker-house-medellin/hhm-web-server.rs` |
| `api.hhaus.org` | `/v1/realtime` | `hhm-api.hhm.svc.cluster.local:8080` | `hacker-house-medellin/hhm-api-server.rs` |

The gateway rejects a request to one of those paths with 426 unless its
`Upgrade` value is `websocket` (case-insensitive). It disables response
buffering and uses 75-second read and send inactivity timeouts. Application
owners must send a ping frame or application data at least every 30 seconds;
the extra interval tolerates one delayed heartbeat without making abandoned
connections unbounded. No prefix, regular expression, or catch-all location
may forward WebSocket upgrade headers.

The Nginx configuration is a first-class file under `k8s/edge/config`.
Kustomize generates an immutable, content-hashed ConfigMap from it, so a config
change produces a new desired-state input and a Deployment rollout. Both edge
container images remain pinned by SHA-256 digest.

## Internal raw TCP on GKE

Raw application TCP is not an Internet edge protocol. It is owned by
`hacker-house-medellin/hhm-api-server.rs`, consumed by
`hacker-house-medellin/hhm-web-server.rs`, and exposed only as:

```text
hhm-api-internal.hhm.svc.cluster.local:8090
```

The Kubernetes identity remains `hhm-api` for the listener and `hhm-web` for
the allowed caller. `hhm-api-internal` is a `ClusterIP` Service, and paired
ingress/egress NetworkPolicies admit port 8090 only between those selected pods
inside namespace `hhm`. The edge gateway has no egress permission for 8090.
Cloudflare Tunnel, Cloud Run, Ingress, NodePort, LoadBalancer, external IPs, and
public DNS are forbidden for this listener.

The API listener owns first-frame authentication and authorization, a maximum
65,536-byte frame, a heartbeat no slower than 30 seconds, and a 75-second idle
timeout. Infrastructure declares those bounds but does not implement the wire
codec. The application owners must validate the same values before a release.

## Private admin and MCP plane

Admin web and admin API have no public hostname, Cloudflare Tunnel, edge
gateway, Ingress, NodePort, or LoadBalancer in this repository. They stay in
namespace `hhm-admin`, whose bundle applies namespace-wide ingress and egress
default-deny policies. The only predeclared application path is admin web to
admin API on TCP/8080 within that namespace. DNS and the dedicated Shared Auth
realm are separately bounded. Database egress stays denied until an exact
private endpoint and selector/CIDR are committed and reviewed.

`hacker-house-medellin/hhm-admin-api-server.rs` owns MCP process supervision.
Its immutable application image must bundle the reviewed
`hacker-house-medellin/hhm-mcp-server.rs` binary and spawn it as a child process
using stdio. MCP JSON-RPC is the only content allowed on child stdout;
diagnostics go to stderr. There is no loopback listener, container port,
Kubernetes Service, or NetworkPolicy allowance for MCP. Admin web reaches MCP
capability only through the private admin API's typed, authorized operations.
If the child exits, emits malformed JSON-RPC, exceeds its bounded message/time
limits, or writes diagnostics to stdout, the admin API must fail closed.

The admin application repositories remain the authorities for their Deployment
and ClusterIP Service manifests. Those manifests must use the exact
`app.kubernetes.io/name` values `admin-web` and `admin-api` so the policies in
`k8s/admin-secrets/network-policies.yaml` select them. The dedicated admin
Shared Auth workload must use `app.kubernetes.io/name: dd-shared-auth-admin`;
the public Shared Auth workload is not an allowed admin dependency. A future private operator
access plane needs its own reviewed policy; this contract does not silently
create one.

## Secret-manager inputs

Create these objects through the audited operator workflow. Never place values
in Git, shell history, pull-request text, or DNS comments:

| Secret | Required key | Consumer |
| --- | --- | --- |
| `hhm/prod/cloudflare/public-tunnel` | `token` | `hhm-public-tunnel` |
| `hhm/prod/api-runtime` | keys named by the API runtime contract | `hhm-api` |
| `hhm/prod/user-web-runtime` | keys named by the web runtime contract | `hhm-web` |
| `hhm/prod/ghcr-pull` | `dockerconfigjson` | public runtime image pulls |
| `hhm/prod/admin-web-runtime` | keys named by the admin web deployment contract | `admin-web` |
| `hhm/prod/admin-api-runtime` | keys named by the admin API deployment contract | `admin-api` and its stdio MCP child |
| `hhm/prod/admin-action-worker-runtime` | isolated admin and product worker database identities | `admin-action-worker` |
| `hhm/prod/admin-ghcr-pull` | `dockerconfigjson` | admin runtime image pulls only |

The `ExternalSecret` objects use the existing
`ClusterSecretStore/dd-cluster-secrets`. Admin secrets never enter the public
edge namespace.

The `k8s/runtime` bundle remains a manual GitOps gate until application image
workflows publish immutable multi-architecture digests and the pre-existing
`:main` integration placeholders are replaced. Do not synchronize a mutable
application image tag into production. The admin bundle is also manual until
the isolated admin database, dedicated Shared Auth admin realm, registry pull
credential, stdio MCP build provenance, and immutable image digest have each
passed independent acceptance.

## Cloudflare configuration after merge

Create one remotely managed tunnel and only these public hostnames:

| Tunnel | Public hostname | Tunnel service |
| --- | --- | --- |
| `hhm-public` | `user.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-public` | `auth.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-public` | `api.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |

End tunnel ingress with an HTTP 404 catch-all. Do not add a wildcard hostname,
an admin hostname, a TCP route, a public cluster origin record, or any path to
the existing cluster edge gateway.

## Fail-closed release order

1. Merge the application protocol contracts. Verify the HTTP/WebSocket routes,
   heartbeat, frame, timeout, first-frame authorization, and stdio rules match
   this repository's contract.
2. Publish API, web, admin, and MCP artifacts. Record their source commits and
   pin multi-architecture image digests; mutable integration tags remain a
   deployment blocker.
3. Apply the GKE bundles only after rendering and policy tests pass. Confirm
   `hhm-api-internal` has a ClusterIP only and that an edge-namespace probe to
   port 8090 is denied while an authorized `hhm-web` probe succeeds.
4. Provision the isolated admin database and dedicated admin Shared Auth realm.
   Prove the public realm cannot mint an admin principal and that MCP has no
   listener or Service.
5. Create only the public tunnel token through the secret workflow and require
   two ready replicas of the connector and public gateway.
6. Add the three public tunnel hostname routes only after upstream health checks
   pass. Exercise all exact WebSocket routes and explicit negative routes.
7. Confirm direct origin, raw TCP, admin, MCP, and confidential Shared Auth
   access are impossible from the public edge.
8. Record current Git SHA, application image digests, Argo revision, tunnel ID,
   DNS answers, WebSocket request IDs, and the internal TCP policy matrix as
   separate evidence.

This repository change is desired state only. It does not mutate Cloudflare,
GCP/GKE, Kubernetes, Neon, Supabase, DNS, or secret-manager state. If any gate
is unavailable, leave the three cluster hostnames absent. The marketing apex
and the exact-city redirect from `medellin.hhaus.org` are independent.
