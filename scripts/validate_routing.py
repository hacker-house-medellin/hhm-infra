#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((ROOT / "routing/hhaus-hosts.json").read_text())

expected_hosts = {
    "hhaus.org",
    "www.hhaus.org",
    "medellin.hhaus.org",
    "user.hhaus.org",
    "auth.hhaus.org",
    "api.hhaus.org",
    "admin.hhaus.org",
    "admin-api.hhaus.org",
}
by_host = {entry["hostname"]: entry for entry in CONTRACT["hosts"]}
if set(by_host) != expected_hosts:
    raise SystemExit(f"hostname contract mismatch: {sorted(set(by_host) ^ expected_hosts)}")

origin_policy = CONTRACT["origin_policy"]
if origin_policy["direct_public_origin"] is not False:
    raise SystemExit("direct public origin must remain disabled")
if by_host["admin.hhaus.org"]["edge"] == by_host["user.hhaus.org"]["edge"]:
    raise SystemExit("admin and public hostnames must use distinct tunnels")
if not by_host["admin.hhaus.org"].get("cloudflare_access"):
    raise SystemExit("admin web must declare Cloudflare Access")
if not by_host["admin-api.hhaus.org"].get("cloudflare_access"):
    raise SystemExit("admin API must declare Cloudflare Access")
if by_host["admin.hhaus.org"].get("upstream") != "http://admin-web.hhm-admin.svc.cluster.local:8080":
    raise SystemExit("admin web upstream must match the deployed Service name and port")
if by_host["admin-api.hhaus.org"].get("upstream") != "http://admin-api.hhm-admin.svc.cluster.local:8080":
    raise SystemExit("admin API upstream must match the deployed Service name and port")

expected_auth_routes = {
    "/",
    "/ui",
    "/auth/browser/sign-in",
    "/auth/browser/consume",
    "/auth/browser/otp",
}
if set(by_host["auth.hhaus.org"]["allowed_routes"]) != expected_auth_routes:
    raise SystemExit("Shared Auth browser allowlist changed")
if "catch-all" not in by_host["auth.hhaus.org"]["denied_route_classes"]:
    raise SystemExit("Shared Auth catch-all must remain denied")

manifest_text = "\n".join(
    path.read_text() for path in sorted((ROOT / "k8s/edge").glob("*.yaml"))
)
for forbidden in ("type: LoadBalancer", "type: NodePort", "kind: Ingress"):
    if forbidden in manifest_text:
        raise SystemExit(f"forbidden direct origin primitive: {forbidden}")
for required in (
    "hhm-public-tunnel-token",
    "hhm-admin-tunnel-token",
    "hhm-public-gateway",
    "hhm-admin-gateway",
    "default-deny",
    "@sha256:",
    "public-tunnel-to-public-gateway-egress",
    "admin-tunnel-to-admin-gateway-egress",
):
    if required not in manifest_text:
        raise SystemExit(f"missing edge invariant: {required}")

public_config = (ROOT / "k8s/edge/public-gateway.yaml").read_text()
for route in expected_auth_routes - {"/"}:
    if f"location = {route}" not in public_config:
        raise SystemExit(f"auth allowlist route missing from gateway: {route}")
for denied in ("/auth/delegate", "/auth/introspect", "/auth/exchange", "/metrics"):
    if f"location = {denied}" in public_config:
        raise SystemExit(f"confidential auth route exposed: {denied}")
if "location / { return 404; }" not in public_config:
    raise SystemExit("auth host has no fail-closed catch-all")

api_manifest = (ROOT / "k8s/base/hhm-api.yaml").read_text()
user_web_manifest = (ROOT / "k8s/base/hhm-mash-web.yaml").read_text()
for name, manifest, port in (
    ("api", api_manifest, "8080"),
    ("user web", user_web_manifest, "8081"),
):
    if "name: HOST, value: 0.0.0.0" not in manifest:
        raise SystemExit(f"{name} manifest does not set the server HOST contract")
    if f'name: PORT, value: "{port}"' not in manifest:
        raise SystemExit(f"{name} manifest does not set the server PORT contract")
    if "name: BIND_ADDR" in manifest:
        raise SystemExit(f"{name} manifest still uses the unsupported BIND_ADDR variable")
if "containerPort: 8081" not in user_web_manifest:
    raise SystemExit("user web manifest does not expose its actual 8081 listener")

network_policies = (ROOT / "k8s/edge/network-policies.yaml").read_text()
public_egress = network_policies.split(
    "name: public-tunnel-to-public-gateway-egress", 1
)[1].split("---", 1)[0]
admin_egress = network_policies.split(
    "name: admin-tunnel-to-admin-gateway-egress", 1
)[1].split("---", 1)[0]
if "hhm-admin-gateway" in public_egress or "hhm-public-gateway" in admin_egress:
    raise SystemExit("tunnel egress crosses the public/admin plane boundary")

print("validated hhaus.org edge routing contract")
