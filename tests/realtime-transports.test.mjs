import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const transports = JSON.parse(await read("../routing/realtime-transports.json"));
const nginx = await read("../k8s/edge/config/public-nginx.conf");
const edgeKustomization = await read("../k8s/edge/kustomization.yaml");
const runtime = await read("../k8s/runtime/public-runtime.yaml");
const runtimePolicies = await read("../k8s/runtime/network-policies.yaml");
const adminPolicies = await read("../k8s/admin-secrets/network-policies.yaml");
const gcpTarget = await read("../gcp/fleet-rust-service-target.yaml");
const edgeFiles = await readdir(new URL("../k8s/edge", import.meta.url), { recursive: true });
const edgeText = (
  await Promise.all(
    edgeFiles
      .filter((path) => path.endsWith(".yaml") || path.endsWith(".conf"))
      .map((path) => read(`../k8s/edge/${path}`)),
  )
).join("\n");

function exactLocation(path) {
  const marker = `location = ${path} {`;
  const start = nginx.indexOf(marker);
  assert.notEqual(start, -1, `missing exact location ${path}`);
  const opening = nginx.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < nginx.length; index += 1) {
    if (nginx[index] === "{") depth += 1;
    if (nginx[index] === "}") depth -= 1;
    if (depth === 0) return nginx.slice(start, index + 1);
  }
  assert.fail(`unterminated exact location ${path}`);
}

test("only three exact public routes forward WebSocket upgrades", () => {
  assert.equal(transports.public_websocket.route_match, "exact");
  assert.equal(transports.public_websocket.allow_catch_all_upgrade, false);
  assert.deepEqual(
    transports.public_websocket.routes.map(({ host, path }) => [host, path]),
    [
      ["user.hhaus.org", "/ws"],
      ["user.hhaus.org", "/ws/chat"],
      ["api.hhaus.org", "/v1/realtime"],
    ],
  );
  assert.equal(nginx.match(/proxy_set_header Upgrade \$http_upgrade;/g)?.length, 3);
  assert.equal(nginx.match(/proxy_set_header Connection \$connection_upgrade;/g)?.length, 3);
  assert.doesNotMatch(nginx, /location\s+(?:\^~|~\*?|~)?\s*\/ws(?:\/|\s)/);
  assert.doesNotMatch(nginx, /location\s+(?:\^~|~\*?|~)?\s*\/v1\/realtime(?:\/|\s)/);

  for (const route of transports.public_websocket.routes) {
    const block = exactLocation(route.path);
    assert.match(block, /if \(\$websocket_upgrade_allowed = 0\) \{ return 426; \}/);
    assert.match(block, /proxy_set_header Upgrade \$http_upgrade;/);
    assert.match(block, /proxy_set_header Connection \$connection_upgrade;/);
    assert.match(block, new RegExp(`proxy_pass ${route.upstream.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`));
  }
});

test("WebSocket heartbeat and proxy inactivity bounds stay aligned", () => {
  assert.equal(transports.public_websocket.heartbeat_max_interval_seconds, 30);
  assert.equal(transports.public_websocket.proxy_read_timeout_seconds, 75);
  assert.equal(transports.public_websocket.proxy_send_timeout_seconds, 75);
  assert.match(nginx, /map \$http_upgrade \$connection_upgrade/);
  assert.match(nginx, /map \$http_upgrade \$websocket_upgrade_allowed/);
  assert.match(nginx, /~\*\^websocket\$ upgrade;[\s\S]*default close;/);
  assert.match(nginx, /~\*\^websocket\$ 1;[\s\S]*default 0;/);
  assert.equal(nginx.match(/proxy_read_timeout 75s;/g)?.length, 3);
  assert.equal(nginx.match(/proxy_send_timeout 75s;/g)?.length, 3);
  assert.equal(nginx.match(/proxy_buffering off;/g)?.length, 3);
});

test("public gateway desired-state inputs are immutable", () => {
  assert.match(edgeKustomization, /configMapGenerator:/);
  assert.match(edgeKustomization, /nginx\.conf=config\/public-nginx\.conf/);
  assert.match(edgeKustomization, /immutable: true/);
  const images = [...edgeText.matchAll(/^\s*image:\s*(\S+)/gm)].map((match) => match[1]);
  assert.ok(images.length >= 2);
  for (const image of images) assert.match(image, /@sha256:[0-9a-f]{64}$/);
});

test("GKE raw TCP is ClusterIP-only and unreachable from public ingress", () => {
  const tcp = transports.internal_raw_tcp;
  assert.equal(tcp.deployment_target, "gke");
  assert.equal(tcp.cloud_run_supported, false);
  assert.equal(tcp.service_name, "hhm-api-internal");
  assert.equal(tcp.service_type, "ClusterIP");
  assert.equal(tcp.port, 8090);
  assert.equal(tcp.application_protocol, "hhm.oresoftware.com/realtime-v1");
  assert.deepEqual(tcp.allowed_kubernetes_callers, ["hhm-web"]);
  assert.equal(tcp.public_route, false);
  assert.match(runtime, /name: hhm-api-internal[\s\S]*type: ClusterIP/);
  assert.match(runtime, /name: hhm-api-internal[\s\S]*internalTrafficPolicy: Cluster[\s\S]*sessionAffinity: None/);
  assert.match(runtime, /name: tcp-realtime[\s\S]*appProtocol: hhm\.oresoftware\.com\/realtime-v1[\s\S]*port: 8090[\s\S]*targetPort: tcp-realtime/);
  assert.match(runtimePolicies, /name: web-to-api-realtime-tcp[\s\S]*app\.kubernetes\.io\/name: hhm-web[\s\S]*port: 8090/);
  assert.doesNotMatch(edgeText, /8090|hhm-api-internal/);
  assert.match(gcpTarget, /hhm\.oresoftware\.com\/raw-tcp-exposure: gke-clusterip-only/);
});

test("application ownership is distinct from Kubernetes workload identity", () => {
  assert.deepEqual(transports.interface_contract, {
    repository: "hacker-house-medellin/hhm-interfaces",
    revision: "b66988b856946ff028085323ff502796b97e0012",
    release_state: "production",
  });
  assert.equal(transports.ownership.api_listener_repository, "hacker-house-medellin/hhm-api-server.rs");
  assert.equal(transports.ownership.web_client_repository, "hacker-house-medellin/hhm-web-server.rs");
  assert.equal(transports.ownership.kubernetes_api_workload, "hhm-api");
  assert.equal(transports.ownership.kubernetes_web_workload, "hhm-web");
});

test("admin MCP is stdio-only behind namespace default deny", () => {
  const mcp = transports.private_admin_mcp;
  assert.equal(mcp.transport, "stdio");
  assert.equal(mcp.network_listener, false);
  assert.equal(mcp.kubernetes_service, false);
  assert.equal(mcp.public_route, false);
  assert.equal(mcp.stdout_contract, "json-rpc-only");
  assert.equal(mcp.diagnostics_contract, "stderr-only");
  assert.match(adminPolicies, /name: default-deny[\s\S]*policyTypes: \[Ingress, Egress\]/);
  assert.match(adminPolicies, /name: admin-web-to-admin-api/);
  assert.match(adminPolicies, /app\.kubernetes\.io\/name: dd-shared-auth-admin/);
  assert.doesNotMatch(adminPolicies, /hhm-edge|8090|mcp/i);
  assert.doesNotMatch(edgeText, /admin\.hhaus\.org|admin-api\.hhaus\.org|hhm-admin|mcp/i);
});
