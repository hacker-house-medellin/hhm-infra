import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest, openApiDocument } from '../src/index.mjs';
import { signBody } from '../src/security.mjs';

const TEST_SECRET = 'test-secret-used-only-by-the-unit-suite';

function configuredHarness(overrides = {}) {
  const queued = [];
  const persisted = [];
  const env = {
    WEBHOOK_SECRET: TEST_SECRET,
    SIGNATURE_MAX_AGE_SECONDS: '300',
    CORS_ORIGINS: 'https://app.example.test, https://admin.example.test',
    EVENT_QUEUE: {
      send: async (value) => {
        queued.push(value);
      },
    },
    STATE_KV: {
      put: async (key, value, options) => {
        persisted.push([key, value, options]);
      },
    },
    ...overrides,
  };
  return { env, queued, persisted };
}

async function signedRequest(path, rawBody, env, options = {}) {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = await signBody(rawBody, env.WEBHOOK_SECRET, timestamp);
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    body: rawBody,
    headers: {
      'content-type': options.contentType ?? 'application/json',
      'x-signature-timestamp': timestamp,
      'x-signature-sha256': `sha256=${signature}`,
      ...(options.headers || {}),
    },
  });
}

test('health response carries restrictive headers and no wildcard CORS', async () => {
  const response = await handleRequest(new Request('https://example.test/healthz'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const body = await response.json();
  assert.equal(body.product, 'hacker-house-medellin');
});

test('readiness fails closed until the required secret, KV, and queue exist', async () => {
  const unavailable = await handleRequest(new Request('https://example.test/readyz'));
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).configured, false);

  const { env } = configuredHarness();
  const ready = await handleRequest(new Request('https://example.test/readyz'), env);
  assert.equal(ready.status, 200);
  const body = await ready.json();
  assert.equal(body.configured, true);
  assert.deepEqual(body.bindings, {
    webhookSecret: true,
    stateKv: true,
    eventQueue: true,
  });
});

test('write endpoints reject missing server configuration', async () => {
  const response = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    }),
  );
  assert.equal(response.status, 503);
});

test('write endpoints reject missing, invalid, and stale signatures', async () => {
  const { env } = configuredHarness();

  const missing = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    }),
    env,
  );
  assert.equal(missing.status, 401);

  const now = String(Math.floor(Date.now() / 1000));
  const invalid = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'x-signature-timestamp': now,
        'x-signature-sha256': `sha256=${'0'.repeat(64)}`,
      },
    }),
    env,
  );
  assert.equal(invalid.status, 401);

  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 601);
  const stale = await handleRequest(
    await signedRequest('/api/events', '{}', env, { timestamp: staleTimestamp }),
    env,
  );
  assert.equal(stale.status, 401);
});

test('signed bodies still receive media-type and JSON-object validation', async () => {
  const { env } = configuredHarness();

  const wrongType = await handleRequest(
    await signedRequest('/api/events', '{}', env, { contentType: 'text/plain' }),
    env,
  );
  assert.equal(wrongType.status, 415);

  const malformed = await handleRequest(
    await signedRequest('/api/events', '{', env),
    env,
  );
  assert.equal(malformed.status, 400);

  const arrayBody = await handleRequest(
    await signedRequest('/api/events', '[]', env),
    env,
  );
  assert.equal(arrayBody.status, 422);
});

test('signed provider webhook persists and queues before returning without waitUntil', async () => {
  const { env, queued, persisted } = configuredHarness();
  const raw = JSON.stringify({ externalId: 'evt-1' });
  const response = await handleRequest(
    await signedRequest('/api/webhooks/provider', raw, env),
    env,
  );

  assert.equal(response.status, 202);
  assert.equal(queued.length, 1);
  assert.equal(persisted.length, 1);
  assert.match(persisted[0][0], /^webhook:provider:/);
  assert.equal(persisted[0][2].expirationTtl, 60 * 60 * 24 * 90);
});

test('server identity fields cannot be overwritten by an incoming event', async () => {
  const { env, persisted } = configuredHarness();
  const raw = JSON.stringify({
    id: 'attacker-controlled-id',
    product: 'not-hhm',
    receivedAt: '1970-01-01T00:00:00.000Z',
    type: 'booking.created',
  });
  const response = await handleRequest(
    await signedRequest('/api/events', raw, env),
    env,
  );

  assert.equal(response.status, 202);
  const stored = JSON.parse(persisted[0][1]);
  assert.notEqual(stored.id, 'attacker-controlled-id');
  assert.equal(stored.product, 'hacker-house-medellin');
  assert.notEqual(stored.receivedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(stored.type, 'booking.created');
});

test('CORS reflects only an exact configured origin and rejects wildcard fallback', async () => {
  const { env } = configuredHarness();

  const allowed = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example.test' },
    }),
    env,
  );
  assert.equal(allowed.status, 204);
  assert.equal(
    allowed.headers.get('access-control-allow-origin'),
    'https://app.example.test',
  );

  const denied = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.test' },
    }),
    env,
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const wildcard = await handleRequest(
    new Request('https://example.test/api/events', {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example.test' },
    }),
    { ...env, CORS_ORIGINS: '*' },
  );
  assert.equal(wildcard.status, 403);
});

test('invalid client request IDs are replaced', async () => {
  const response = await handleRequest(
    new Request('https://example.test/healthz', {
      headers: { 'x-request-id': 'x'.repeat(200) },
    }),
  );
  const body = await response.json();
  assert.notEqual(body.requestId, 'x'.repeat(200));
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
});

test('OpenAPI advertises timestamped signature requirements', () => {
  const document = openApiDocument();
  const operation = document.paths['/api/events'].post;
  assert.equal(document.info.version, '0.2.0');
  assert.deepEqual(
    operation.parameters.map((parameter) => parameter.name),
    ['x-signature-timestamp', 'x-signature-sha256'],
  );
});
