# `hhaus.org` routing and release gates

`routing/hhaus-hosts.json` is the machine-readable hostname contract. The edge
manifests in `k8s/edge` deliberately contain no public `LoadBalancer`, `NodePort`,
or `Ingress`: both planes establish outbound Cloudflare Tunnel connections.

## Trust planes

The public connector may reach only the public gateway. That gateway serves
`user.hhaus.org`, `api.hhaus.org`, and exactly five browser-safe Shared Auth
routes on `auth.hhaus.org`. The same five routes are available under the
same-origin `/shared-auth-ui` prefix on `user.hhaus.org`. Delegation,
introspection, exchange, metrics, and every other Shared Auth path return 404 at
the gateway.

The admin connector has a distinct token, Deployment, gateway, and NetworkPolicy.
`admin.hhaus.org` must have an interactive SSO/MFA Cloudflare Access application;
`admin-api.hhaus.org` must have a service-token policy. Both applications must
end with a default-deny policy. Cloudflare Access is an outer boundary, not a
replacement for the admin servers' dedicated Shared Auth realm and role checks.
The gateway resolves the admin repositories' exact Kubernetes Services,
`admin-web.hhm-admin.svc.cluster.local:8080` and
`admin-api.hhm-admin.svc.cluster.local:8080`; those Services must explicitly
allow ingress from the `hhm-edge` admin gateway pod.

## Secret-manager inputs

Create these AWS Secrets Manager objects through the normal audited operator
workflow; do not place their values in Git, shell history, pull-request text, or
Cloudflare DNS comments:

| Secret | Required key | Consumer |
| --- | --- | --- |
| `hhm/prod/cloudflare/public-tunnel` | `token` | `hhm-public-tunnel` |
| `hhm/prod/cloudflare/admin-tunnel` | `token` | `hhm-admin-tunnel` |

The `ExternalSecret` objects read them through the existing
`ClusterSecretStore/dd-cluster-secrets`. Rotation is independent between the
two planes.

Runtime deployments additionally need their own secret-manager objects (for
example `hhm/prod/api-runtime` and `hhm/prod/user-web-runtime`). They are not
modeled here until the runtime image workflows publish immutable digests.

## Cloudflare configuration after merge

Create two remotely managed tunnels and route only these public hostnames:

| Tunnel | Public hostname | Tunnel service |
| --- | --- | --- |
| `hhm-public` | `user.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-public` | `auth.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-public` | `api.hhaus.org` | `http://hhm-public-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-admin` | `admin.hhaus.org` | `http://hhm-admin-gateway.hhm-edge.svc.cluster.local:8080` |
| `hhm-admin` | `admin-api.hhaus.org` | `http://hhm-admin-gateway.hhm-edge.svc.cluster.local:8080` |

End both tunnel ingress configurations with an HTTP 404 catch-all. Do not add a
wildcard hostname, a public AWS origin record, or any path to the existing
cluster edge gateway.

## Fail-closed release order

1. Merge and apply the primary PostgreSQL migration; verify tables, triggers,
   RLS, and the append-only points ledger against the production database.
2. Complete the Supabase provider preview/review/apply/readback gates. Keep the
   private evidence bucket service-role-only and verify the 10 MiB limit.
3. Publish the API, user web, admin web, and admin API images and pin their
   multi-architecture digests in their runtime manifests.
4. Provision the dedicated admin Shared Auth realm, audiences, roles, and
   confidential credentials. Verify the public realm cannot mint an admin
   principal.
5. Create the two tunnel tokens in AWS Secrets Manager and apply `k8s/edge`.
   Require two ready replicas of each connector and gateway.
6. Create the two Access applications and their default-deny policies, then
   add the five tunnel public-hostname routes. DNS is created by the tunnel
   route only after the connector and upstream health checks pass.
7. Test every expected route and every explicit negative route. Confirm direct
   AWS origin access is impossible and that `auth.hhaus.org/auth/introspect`,
   `/auth/delegate`, `/auth/exchange`, and `/metrics` all return 404.
8. Record current Git SHA, image digest, Argo revision, Cloudflare application
   and tunnel IDs, DNS answers, and production request IDs as separate evidence.

If any gate is unavailable, leave the five cluster hostname records absent.
The global marketing apex and the exact-city redirect from
`medellin.hhaus.org` to `hhaus.org/locations/medellin/` are independent of
these cluster gates.
