#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOSTS = json.loads((ROOT / "routing/hhaus-hosts.json").read_text())
TRANSPORTS = json.loads((ROOT / "routing/realtime-transports.json").read_text())


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def document_containing(text, marker):
    matches = [document for document in text.split("---") if marker in document]
    require(len(matches) == 1, f"expected one YAML document containing {marker!r}")
    return matches[0]


def nginx_block_at(text, start):
    brace = text.find("{", start)
    depth = 0
    for index in range(brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    raise SystemExit(f"unterminated Nginx block at byte {start}")


def nginx_location(text, path):
    marker = f"location = {path} {{"
    start = text.find(marker)
    require(start >= 0, f"exact WebSocket route missing from Nginx: {path}")
    return nginx_block_at(text, start)


expected_hosts = {
    "hhaus.org",
    "www.hhaus.org",
    "berlin.hhaus.org",
    "medellin.hhaus.org",
    "tokyo.hhaus.org",
    "london.hhaus.org",
    "sao-paulo.hhaus.org",
    "cdmx.hhaus.org",
    "montreal.hhaus.org",
    "user.hhaus.org",
    "auth.hhaus.org",
    "api.hhaus.org",
}
by_host = {entry["hostname"]: entry for entry in HOSTS["hosts"]}
require(set(by_host) == expected_hosts, "public hostname contract must exclude admin hosts")

edge_contract = HOSTS["cloudflare_edge_contract"]
require(edge_contract["minimum_tls_version"] == "1.2", "Cloudflare minimum TLS must remain 1.2")
require(edge_contract["always_use_https"] is True, "Cloudflare must redirect HTTP to HTTPS")
require(edge_contract["tls_1_3"] is True, "Cloudflare TLS 1.3 must remain enabled")
require(edge_contract["city_redirect_status_code"] == 308, "city redirects must remain permanent")
require(edge_contract["city_redirect_preserves_query_string"] is True, "city redirects must preserve query strings")
require(edge_contract["city_redirect_match"] == "exact-host", "city redirects must use exact host matching")
require(edge_contract["worker_routes"] is False, "marketing routing must not be shadowed by a Worker route")

city_routes = {
    "berlin.hhaus.org": "https://hhaus.org/locations/berlin/",
    "medellin.hhaus.org": "https://hhaus.org/locations/medellin/",
    "tokyo.hhaus.org": "https://hhaus.org/locations/tokyo/",
    "london.hhaus.org": "https://hhaus.org/locations/london/",
    "sao-paulo.hhaus.org": "https://hhaus.org/locations/sao-paulo/",
    "cdmx.hhaus.org": "https://hhaus.org/locations/cdmx/",
    "montreal.hhaus.org": "https://hhaus.org/locations/montreal/",
}
for hostname, target in city_routes.items():
    entry = by_host[hostname]
    require(entry["purpose"] == "location-marketing-alias", f"{hostname} purpose changed")
    require(entry["edge"] == "cloudflare-city-redirect-to-apex-path", f"{hostname} edge changed")
    require(entry["state"] == "live", f"{hostname} must remain live")
    require(entry["routes"] == [target], f"{hostname} canonical target changed")
    require(entry["dns"]["type"] == "CNAME", f"{hostname} DNS record must remain CNAME")
    require(entry["dns"]["proxied"] is True, f"{hostname} must remain proxied")
    expected_origin = "hacker-house-medellin.github.io" if hostname == "medellin.hhaus.org" else "hhaus-org.github.io"
    require(entry["dns"]["target"] == expected_origin, f"{hostname} DNS origin changed")

for hostname in ("hhaus.org", "www.hhaus.org"):
    require(by_host[hostname]["dns"] == {
        "type": "CNAME",
        "target": "hhaus-org.github.io",
        "proxied": False,
    }, f"{hostname} GitHub Pages DNS contract changed")

interface_contract = TRANSPORTS["interface_contract"]
require(interface_contract["repository"] == "hacker-house-medellin/hhm-interfaces", "interface authority changed")
require(re.fullmatch(r"[0-9a-f]{40}", interface_contract["revision"]) is not None, "interface revision must be a full commit SHA")
require(interface_contract["revision"] == "b66988b856946ff028085323ff502796b97e0012", "transport envelope revision changed")
require(interface_contract["release_state"] == "production", "transport envelope is not production")

origin_policy = HOSTS["origin_policy"]
require(origin_policy["direct_public_origin"] is False, "direct public origin must remain disabled")
require(origin_policy["admin_entrypoint"] == "private-network-only", "admin entrypoint must stay private")
require(origin_policy["admin_public_hostnames_allowed"] is False, "admin public hostnames must be forbidden")
require(origin_policy["public_raw_tcp_allowed"] is False, "raw TCP must be forbidden at the public edge")

expected_auth_routes = {
    "/",
    "/ui",
    "/auth/browser/sign-in",
    "/auth/browser/consume",
    "/auth/browser/otp",
}
require(set(by_host["auth.hhaus.org"]["allowed_routes"]) == expected_auth_routes, "Shared Auth browser allowlist changed")
require("catch-all" in by_host["auth.hhaus.org"]["denied_route_classes"], "Shared Auth catch-all must remain denied")
require(set(by_host["user.hhaus.org"]["websocket_routes"]) == {"/ws", "/ws/chat"}, "user WebSocket allowlist changed")
require(by_host["api.hhaus.org"]["websocket_routes"] == ["/v1/realtime"], "API WebSocket allowlist changed")

edge_files = sorted((ROOT / "k8s/edge").rglob("*.yaml")) + sorted((ROOT / "k8s/edge").rglob("*.conf"))
edge_text = "\n".join(path.read_text() for path in edge_files)
for forbidden in (
    "type: LoadBalancer",
    "type: NodePort",
    "kind: Ingress",
    "admin.hhaus.org",
    "admin-api.hhaus.org",
    "hhm-admin-tunnel",
    "hhm-admin-gateway",
    "hhm/prod/cloudflare/admin-tunnel",
):
    require(forbidden not in edge_text, f"forbidden public edge primitive: {forbidden}")
for required in (
    "hhm-public-tunnel-token",
    "hhm-public-gateway",
    "default-deny",
    "@sha256:",
    "public-tunnel-to-public-gateway-egress",
):
    require(required in edge_text, f"missing public edge invariant: {required}")
require("8090" not in edge_text, "public edge must not route the internal TCP port")

for image in re.findall(r"^\s*image:\s*(\S+)", edge_text, flags=re.MULTILINE):
    require(re.search(r"@sha256:[0-9a-f]{64}$", image) is not None, f"edge image is not digest-pinned: {image}")

kustomization = (ROOT / "k8s/edge/kustomization.yaml").read_text()
require("configMapGenerator:" in kustomization, "public Nginx config must be generated")
require("nginx.conf=config/public-nginx.conf" in kustomization, "generated Nginx input is missing")
require("immutable: true" in kustomization, "generated Nginx ConfigMap must be immutable")
require("admin-gateway.yaml" not in kustomization, "admin gateway must not be an edge resource")

nginx = (ROOT / "k8s/edge/config/public-nginx.conf").read_text()
require("map $http_upgrade $connection_upgrade" in nginx, "Connection upgrade map is missing")
require("map $http_upgrade $websocket_upgrade_allowed" in nginx, "WebSocket admission map is missing")
require("~*^websocket$ upgrade;" in nginx, "WebSocket Connection map does not require websocket")
require("~*^websocket$ 1;" in nginx, "WebSocket admission map does not require websocket")
require(nginx.count("proxy_set_header Upgrade $http_upgrade;") == 3, "only three routes may forward Upgrade")
require(nginx.count("proxy_set_header Connection $connection_upgrade;") == 3, "only three routes may forward Connection")
require(nginx.count("proxy_read_timeout 75s;") == 3, "every WebSocket route needs the bounded read timeout")
require(nginx.count("proxy_send_timeout 75s;") == 3, "every WebSocket route needs the bounded send timeout")
require(nginx.count("proxy_buffering off;") == 3, "every WebSocket route must disable buffering")

transport_ws = TRANSPORTS["public_websocket"]
require(transport_ws["route_match"] == "exact", "WebSocket route contract must use exact matching")
require(transport_ws["allow_catch_all_upgrade"] is False, "catch-all WebSocket upgrade must stay disabled")
require(transport_ws["heartbeat_max_interval_seconds"] == 30, "WebSocket heartbeat bound changed")
require(transport_ws["proxy_read_timeout_seconds"] == 75, "WebSocket read timeout changed")
require(transport_ws["proxy_send_timeout_seconds"] == 75, "WebSocket send timeout changed")

expected_websockets = {
    ("user.hhaus.org", "/ws", "http://hhm-web.hhm.svc.cluster.local:8081"),
    ("user.hhaus.org", "/ws/chat", "http://hhm-web.hhm.svc.cluster.local:8081"),
    ("api.hhaus.org", "/v1/realtime", "http://hhm-api.hhm.svc.cluster.local:8080"),
}
actual_websockets = {(route["host"], route["path"], route["upstream"]) for route in transport_ws["routes"]}
require(actual_websockets == expected_websockets, "public WebSocket routes or upstreams changed")
for _, path, upstream in expected_websockets:
    block = nginx_location(nginx, path)
    for directive in (
        "if ($websocket_upgrade_allowed = 0) { return 426; }",
        "proxy_set_header Upgrade $http_upgrade;",
        "proxy_set_header Connection $connection_upgrade;",
        "proxy_read_timeout 75s;",
        "proxy_send_timeout 75s;",
        "proxy_buffering off;",
        f"proxy_pass {upstream};",
    ):
        require(directive in block, f"{path} is missing {directive}")
for match in re.finditer(r"location / \{", nginx):
    catch_all = nginx_block_at(nginx, match.start())
    require("proxy_set_header Upgrade" not in catch_all, "catch-all location forwards WebSocket Upgrade")

for route in expected_auth_routes - {"/"}:
    require(f"location = {route}" in nginx, f"auth allowlist route missing from gateway: {route}")
for denied in ("/auth/delegate", "/auth/introspect", "/auth/exchange", "/metrics"):
    require(f"location = {denied}" not in nginx, f"confidential auth route exposed: {denied}")
require("location / { return 404; }" in nginx, "auth host has no fail-closed catch-all")

runtime_manifest = (ROOT / "k8s/runtime/public-runtime.yaml").read_text()
tcp_service = document_containing(runtime_manifest, "name: hhm-api-internal")
for required in (
    "type: ClusterIP",
    "internalTrafficPolicy: Cluster",
    "sessionAffinity: None",
    "hhm.network/exposure: cluster-internal-only",
    "name: tcp-realtime",
    "appProtocol: hhm.oresoftware.com/realtime-v1",
    "port: 8090",
    "targetPort: tcp-realtime",
):
    require(required in tcp_service, f"internal TCP Service is missing {required}")
for forbidden in ("NodePort", "LoadBalancer", "externalIPs", "loadBalancerIP"):
    require(forbidden not in tcp_service, f"internal TCP Service has public exposure: {forbidden}")
require("containerPort: 8090" in runtime_manifest, "API workload does not declare the raw TCP listener")

runtime_policies = (ROOT / "k8s/runtime/network-policies.yaml").read_text()
tcp_ingress = document_containing(runtime_policies, "name: web-to-api-realtime-tcp")
require("app.kubernetes.io/name: hhm-api" in tcp_ingress, "TCP ingress must select hhm-api")
require("app.kubernetes.io/name: hhm-web" in tcp_ingress, "TCP ingress must allow only hhm-web")
require("port: 8090" in tcp_ingress, "TCP ingress port changed")
web_egress = document_containing(runtime_policies, "name: web-required-egress")
require("port: 8090" in web_egress, "hhm-web lacks paired TCP egress")

raw_tcp = TRANSPORTS["internal_raw_tcp"]
require(raw_tcp["deployment_target"] == "gke", "raw TCP target must remain GKE")
require(raw_tcp["cloud_run_supported"] is False, "raw TCP must not target Cloud Run")
require(raw_tcp["service_name"] == "hhm-api-internal", "raw TCP Service identity changed")
require(raw_tcp["service_type"] == "ClusterIP" and raw_tcp["port"] == 8090, "raw TCP exposure changed")
require(raw_tcp["application_protocol"] == "hhm.oresoftware.com/realtime-v1", "raw TCP application protocol changed")
require(raw_tcp["public_route"] is False, "raw TCP gained a public route")
require(raw_tcp["allowed_kubernetes_callers"] == ["hhm-web"], "raw TCP caller allowlist changed")
require(raw_tcp["listener_owner_repository"].endswith("/hhm-api-server.rs"), "raw TCP listener owner changed")
require(raw_tcp["client_owner_repository"].endswith("/hhm-web-server.rs"), "raw TCP client owner changed")
require(raw_tcp["first_frame_requires_authorization"] is True, "raw TCP must authenticate its first frame")
require(raw_tcp["maximum_frame_bytes"] == 65536, "raw TCP frame bound changed")

gcp_target = (ROOT / "gcp/fleet-rust-service-target.yaml").read_text()
require("hhm.oresoftware.com/realtime-contract: routing/realtime-transports.json" in gcp_target, "GCP target does not link the realtime contract")
require("hhm.oresoftware.com/raw-tcp-exposure: gke-clusterip-only" in gcp_target, "GCP raw TCP boundary changed")

admin_mcp = TRANSPORTS["private_admin_mcp"]
require(admin_mcp["transport"] == "stdio", "admin MCP transport must stay stdio")
require(admin_mcp["network_listener"] is False, "admin MCP must not open a network listener")
require(admin_mcp["kubernetes_service"] is False, "admin MCP must not have a Service")
require(admin_mcp["public_route"] is False, "admin MCP must not have a public route")
require(admin_mcp["process_owner_repository"].endswith("/hhm-admin-api-server.rs"), "admin MCP process owner changed")

admin_bundle = "\n".join(path.read_text() for path in sorted((ROOT / "k8s/admin-secrets").glob("*.yaml")))
admin_policies = (ROOT / "k8s/admin-secrets/network-policies.yaml").read_text()
for required in (
    "name: default-deny",
    "policyTypes: [Ingress, Egress]",
    "name: admin-web-to-admin-api",
    "name: admin-web-to-admin-api-egress",
    "name: admin-api-to-shared-auth",
    "app.kubernetes.io/name: dd-shared-auth-admin",
):
    require(required in admin_policies, f"private admin policy is missing {required}")
require("hhm-edge" not in admin_policies, "admin policy allows the public edge namespace")
require("kind: Service\n" not in admin_bundle, "admin bundle must not expose an MCP or admin Service")
require("containerPort" not in admin_bundle, "admin bundle must not add a listener")

desired = TRANSPORTS["desired_state_inputs"]
require(desired["gateway_config"] == "content-hashed-immutable-configmap", "gateway config lost immutability")
require(desired["edge_images"] == "sha256-digest-only", "edge image policy changed")
require(desired["application_images"].startswith("blocked-until-sha256"), "application image gate changed")

print("validated public WebSocket, internal TCP, and private admin MCP contracts")
