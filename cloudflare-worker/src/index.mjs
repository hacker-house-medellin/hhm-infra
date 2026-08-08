import { verifyRequiredSignature } from './security.mjs';

const PRODUCT = Object.freeze({
  org: 'hacker-house-medellin',
  name: 'Hacker House Medellín',
  tagline: 'A practical operating system for hacker-house stays, coworking, community, and events.',
  audience: 'founders, engineers, digital nomads, residents, guests, hosts, and community operators',
  integrations: [
    'Booking calendars',
    'Door access',
    'Stripe',
    'WhatsApp',
    'Community events',
    'Occupancy sensors',
  ],
  capabilities: ['bookings', 'occupancy', 'community', 'events', 'alerts', 'audit'],
});

const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function allowedOrigins(env = {}) {
  return String(env.CORS_ORIGINS ?? env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');
}

function corsHeaders(request, env = {}) {
  const headers = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,x-request-id,x-signature-sha256,x-signature-timestamp',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

function responseHeaders(request, env = {}) {
  return {
    ...corsHeaders(request, env),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'permissions-policy': 'camera=(), geolocation=(), microphone=()',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow',
  };
}

function json(request, data, init = {}, env = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...responseHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function requestIdFor(request) {
  const supplied = request.headers.get('x-request-id');
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

function configuration(env = {}) {
  const bindings = {
    webhookSecret: typeof env.WEBHOOK_SECRET === 'string' && env.WEBHOOK_SECRET.length > 0,
    stateKv: Boolean(env.STATE_KV && typeof env.STATE_KV.put === 'function'),
    eventQueue: Boolean(env.EVENT_QUEUE && typeof env.EVENT_QUEUE.send === 'function'),
  };
  return {
    configured: Object.values(bindings).every(Boolean),
    bindings,
  };
}

function requireWriteConfiguration(request, env) {
  const status = configuration(env);
  if (status.configured) return null;
  return json(
    request,
    { ok: false, error: 'service not configured', configured: false },
    { status: 503 },
    env,
  );
}

function isJsonContentType(request) {
  const contentType = request.headers.get('content-type') || '';
  return /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(contentType);
}

async function parseSignedJson(request, env) {
  if (!isJsonContentType(request)) {
    return {
      ok: false,
      response: json(
        request,
        { ok: false, error: 'content type must be application/json' },
        { status: 415 },
        env,
      ),
    };
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: json(request, { ok: false, error: 'payload too large' }, { status: 413 }, env),
    };
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: json(request, { ok: false, error: 'invalid request body' }, { status: 400 }, env),
    };
  }

  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: json(request, { ok: false, error: 'payload too large' }, { status: 413 }, env),
    };
  }

  const signature = await verifyRequiredSignature(request, raw, env);
  if (!signature.ok) {
    const unavailable = signature.reason === 'server-not-configured';
    return {
      ok: false,
      response: json(
        request,
        { ok: false, error: unavailable ? 'service not configured' : 'invalid signature' },
        { status: unavailable ? 503 : 401 },
        env,
      ),
    };
  }

  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ok: false,
        response: json(
          request,
          { ok: false, error: 'JSON body must be an object' },
          { status: 422 },
          env,
        ),
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: json(request, { ok: false, error: 'invalid json' }, { status: 400 }, env),
    };
  }
}

async function persist(binding, key, value) {
  await binding.put(key, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function enqueue(binding, value) {
  await binding.send(value);
}

async function schedule(ctx, task) {
  if (typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(task);
    return;
  }
  await task;
}

function providerFromPath(pathname) {
  const match = pathname.match(
    /^\/api\/webhooks\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/,
  );
  return match?.[1] || null;
}

function signedOperation(summary) {
  return {
    summary,
    parameters: [
      {
        in: 'header',
        name: 'x-signature-timestamp',
        required: true,
        schema: { type: 'string', pattern: '^\\d{10}(?:\\d{3})?$' },
      },
      {
        in: 'header',
        name: 'x-signature-sha256',
        required: true,
        schema: { type: 'string', pattern: '^sha256=[a-f0-9]{64}$' },
      },
    ],
    responses: {
      202: { description: 'Accepted' },
      401: { description: 'Invalid, missing, or stale signature' },
      503: { description: 'Required Worker bindings are not configured' },
    },
  };
}

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: `${PRODUCT.name} Edge API`, version: '0.2.0' },
    paths: {
      '/healthz': { get: { summary: 'Health probe' } },
      '/readyz': { get: { summary: 'Readiness and binding probe' } },
      '/api/config': { get: { summary: 'Public product and integration configuration' } },
      '/api/events': { post: signedOperation('Accept a signed event envelope') },
      '/api/alerts': { post: signedOperation('Accept a signed alert envelope') },
      '/api/webhooks/{provider}': {
        post: signedOperation('Accept a signed provider webhook'),
      },
    },
  };
}

export async function handleRequest(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const requestId = requestIdFor(request);

  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    if (!origin || !allowedOrigins(env).includes(origin)) {
      return json(request, { ok: false, error: 'origin not allowed', requestId }, { status: 403 }, env);
    }
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }

  if (url.pathname === '/healthz' && request.method === 'GET') {
    return json(
      request,
      { ok: true, product: PRODUCT.org, status: 'healthy', requestId },
      {},
      env,
    );
  }

  if (url.pathname === '/readyz' && request.method === 'GET') {
    const status = configuration(env);
    return json(
      request,
      { ok: status.configured, product: PRODUCT.org, ...status, requestId },
      { status: status.configured ? 200 : 503 },
      env,
    );
  }

  if (url.pathname === '/api/config' && request.method === 'GET') {
    return json(request, { ok: true, product: PRODUCT, requestId }, {}, env);
  }

  if (url.pathname === '/api/openapi.json' && request.method === 'GET') {
    return json(request, openApiDocument(), {}, env);
  }

  const provider = providerFromPath(url.pathname);
  if (provider && request.method === 'POST') {
    const unavailable = requireWriteConfiguration(request, env);
    if (unavailable) return unavailable;

    const parsed = await parseSignedJson(request, env);
    if (!parsed.ok) return parsed.response;

    const webhook = {
      id: crypto.randomUUID(),
      provider,
      product: PRODUCT.org,
      receivedAt: new Date().toISOString(),
      payload: parsed.value,
    };
    await persist(env.STATE_KV, `webhook:${provider}:${webhook.id}`, webhook);
    await schedule(
      ctx,
      enqueue(env.EVENT_QUEUE, { type: 'provider.webhook.received', webhook }),
    );
    return json(
      request,
      { ok: true, accepted: true, webhookId: webhook.id, requestId },
      { status: 202 },
      env,
    );
  }

  if ((url.pathname === '/api/events' || url.pathname === '/api/alerts') && request.method === 'POST') {
    const unavailable = requireWriteConfiguration(request, env);
    if (unavailable) return unavailable;

    const parsed = await parseSignedJson(request, env);
    if (!parsed.ok) return parsed.response;

    const kind = url.pathname.endsWith('/alerts') ? 'alert' : 'event';
    const envelope = {
      ...parsed.value,
      id: crypto.randomUUID(),
      product: PRODUCT.org,
      receivedAt: new Date().toISOString(),
    };
    await persist(env.STATE_KV, `${kind}:${envelope.id}`, envelope);
    const queue = kind === 'alert' ? env.ALERT_QUEUE || env.EVENT_QUEUE : env.EVENT_QUEUE;
    await schedule(ctx, enqueue(queue, { type: `${kind}.received`, [kind]: envelope }));
    return json(
      request,
      { ok: true, accepted: true, [`${kind}Id`]: envelope.id, requestId },
      { status: 202 },
      env,
    );
  }

  return json(request, { ok: false, error: 'not found', requestId }, { status: 404 }, env);
}

export default { fetch: handleRequest };
