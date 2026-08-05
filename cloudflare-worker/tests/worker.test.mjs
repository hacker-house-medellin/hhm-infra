import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../src/index.mjs';
import { signBody } from '../src/security.mjs';

test('health and security headers', async () => {
  const response = await handleRequest(new Request('https://example.test/healthz'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const body = await response.json();
  assert.equal(body.product, 'hacker-house-medellin');
});

test('rejects invalid JSON', async () => {
  const response = await handleRequest(new Request('https://example.test/api/events', { method: 'POST', body: '{' }));
  assert.equal(response.status, 400);
});

test('verifies signed provider webhook and queues it', async () => {
  const raw = JSON.stringify({ externalId: 'evt-1' });
  const secret = 'test-secret';
  const signature = await signBody(raw, secret);
  const queued = [];
  const persisted = [];
  const env = {
    WEBHOOK_SECRET: secret,
    EVENT_QUEUE: { send: async (value) => queued.push(value) },
    STATE_KV: { put: async (key, value) => persisted.push([key, value]) },
  };
  const tasks = [];
  const response = await handleRequest(new Request('https://example.test/api/webhooks/provider', {
    method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-signature-sha256': `sha256=${signature}` },
  }), env, { waitUntil: (promise) => tasks.push(promise) });
  await Promise.all(tasks);
  assert.equal(response.status, 202);
  assert.equal(queued.length, 1);
  assert.equal(persisted.length, 1);
});

test('rejects invalid signatures', async () => {
  const response = await handleRequest(new Request('https://example.test/api/events', {
    method: 'POST', body: '{}', headers: { 'x-signature-sha256': 'sha256=' + '0'.repeat(64) },
  }), { WEBHOOK_SECRET: 'secret' });
  assert.equal(response.status, 401);
});

test('exposes product integrations', async () => {
  const response = await handleRequest(new Request('https://example.test/api/config'));
  const body = await response.json();
  assert.ok(body.product.integrations.length >= 5);
});
