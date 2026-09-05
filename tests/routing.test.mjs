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

test("admin and public traffic use distinct fail-closed planes", () => {
  assert.equal(contract.origin_policy.direct_public_origin, false);
  assert.notEqual(hosts.get("admin.hhaus.org").edge, hosts.get("user.hhaus.org").edge);
  assert.match(hosts.get("admin.hhaus.org").cloudflare_access, /default-deny/);
  assert.match(hosts.get("admin-api.hhaus.org").cloudflare_access, /default-deny/);
  assert.equal(
    hosts.get("admin.hhaus.org").upstream,
    "http://admin-web.hhm-admin.svc.cluster.local:8080",
  );
  assert.equal(
    hosts.get("admin-api.hhaus.org").upstream,
    "http://admin-api.hhm-admin.svc.cluster.local:8080",
  );
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

test("production runtime names the canonical Rust images and secret-manager inputs", () => {
  assert.match(productionRuntime, /ghcr\.io\/hacker-house-medellin\/hhm-api:main/);
  assert.match(productionRuntime, /ghcr\.io\/hacker-house-medellin\/hhm-web:main/);
  assert.match(productionRuntime, /name: hhm-api-runtime/);
  assert.match(productionRuntime, /name: hhm-web-runtime/);
  assert.match(productionRuntime, /name: hhm-ghcr-pull/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/api-runtime/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/user-web-runtime/);
  assert.match(productionRuntimeSecrets, /key: hhm\/prod\/ghcr-pull/);
});
