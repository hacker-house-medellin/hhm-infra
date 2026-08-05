import test from "node:test"; import assert from "node:assert/strict"; import worker from "../src/index.js";
test("blocks generic proxy paths", async () => { assert.equal((await worker.fetch(new Request("https://x/healthz"), {})).status, 200); assert.equal((await worker.fetch(new Request("https://x/proxy"), {})).status, 404); });
