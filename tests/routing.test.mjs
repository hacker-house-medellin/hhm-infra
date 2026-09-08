import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(
  await readFile(new URL("../routing/hhaus-hosts.json", import.meta.url), "utf8"),
);
const hosts = new Map(contract.hosts.map((entry) => [entry.hostname, entry]));
const apiManifest = await readFile(
  new URL("../k8s/base/hhm-api.yaml", import.meta.url),
  "utf8",
);
const userWebManifest = await readFile(
  new URL("../k8s/base/hhm-mash-web.yaml", import.meta.url),
  "utf8",
);
const productionRuntime = await readFile(
  new URL("../k8s/runtime/public-runtime.yaml", import.meta.url),
  "utf8",
);
const productionRuntimeSecrets = await readFile(
  new URL("../k8s/runtime/external-secrets.yaml", import.meta.url),
  "utf8",
);

test("admin traffic has no public hostname or edge entrypoint", () => {
  assert.equal(contract.origin_policy.direct_public_origin, false);
  assert.equal(contract.origin_policy.admin_entrypoint, "private-network-only");
  assert.equal(contract.origin_policy.admin_public_hostnames_allowed, false);
  assert.equal(contract.origin_policy.public_raw_tcp_allowed, false);
  assert.equal(hosts.has("admin.hhaus.org"), false);
  assert.equal(hosts.has("admin-api.hhaus.org"), false);
  assert.equal(
    hosts.get("user.hhaus.org").upstream,
    "http://hhm-web.hhm.svc.cluster.local:8081",
  );
  assert.equal(
    hosts.get("api.hhaus.org").upstream,
    "http://hhm-api.hhm.svc.cluster.local:8080",
  );
});

test("Shared Auth exposes only the browser ceremony", () => {
  assert.deepEqual(
    new Set(hosts.get("auth.hhaus.org").allowed_routes),
    new Set([
      "/",
      "/ui",
      "/auth/browser/sign-in",
      "/auth/browser/consume",
      "/auth/browser/otp",
    ]),
  );
  assert.ok(hosts.get("auth.hhaus.org").denied_route_classes.includes("catch-all"));
});

test("authenticated forms and referrals stay on the user host", () => {
  assert.deepEqual(
    new Set(hosts.get("user.hhaus.org").routes),
    new Set(["/submit-pre-interest", "/submit-application", "/submit-referral"]),
  );
  assert.deepEqual(hosts.get("user.hhaus.org").websocket_routes, ["/ws", "/ws/chat"]);
  assert.deepEqual(hosts.get("api.hhaus.org").websocket_routes, ["/v1/realtime"]);
});

test("runtime manifests use the servers actual host and port contract", () => {
  assert.match(apiManifest, /name: HOST, value: 0\.0\.0\.0/);
  assert.match(apiManifest, /name: PORT, value: "8080"/);
  assert.doesNotMatch(apiManifest, /name: BIND_ADDR/);

  assert.match(userWebManifest, /containerPort: 8081/);
  assert.match(userWebManifest, /name: HOST, value: 0\.0\.0\.0/);
  assert.match(userWebManifest, /name: PORT, value: "8081"/);
  assert.doesNotMatch(userWebManifest, /name: BIND_ADDR/);
});

test("production runtime keeps provider inputs out of public routing", () => {
  assert.match(productionRuntime, /name: hhm-api-runtime/);
  assert.match(productionRuntime, /name: hhm-web-runtime/);
  assert.match(productionRuntime, /name: hhm-ghcr-pull/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/api-runtime/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/user-web-runtime/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/ghcr-pull/);
});
