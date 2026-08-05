import { verifyOptionalSignature } from './security.mjs';

const PRODUCT = Object.freeze({"org": "hacker-house-medellin", "name": "Hacker House Medellín", "tagline": "A practical operating system for hacker-house stays, coworking, community, and events.", "audience": "founders, engineers, digital nomads, residents, guests, hosts, and community operators", "integrations": ["Booking calendars", "Door access", "Stripe", "WhatsApp", "Community events", "Occupancy sensors"], "capabilities": ["bookings", "occupancy", "community", "events", "alerts", "audit"]});
const MAX_BODY_BYTES = 256 * 1024;

function corsHeaders(env = {}) {
  return {
    'access-control-allow-origin': env.CORS_ORIGIN || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-signature-sha256,x-request-id',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function responseHeaders(env = {}) {
  return {
    ...corsHeaders(env),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function json(data, init = {}, env = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...responseHeaders(env), ...(init.headers || {}) },
  });
}

async function parseSignedJson(request, env) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return { ok: false, response: json({ ok: false, error: 'payload too large' }, { status: 413 }, env) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { ok: false, response: json({ ok: false, error: 'payload too large' }, { status: 413 }, env) };
  if (!(await verifyOptionalSignature(request, raw, env))) return { ok: false, response: json({ ok: false, error: 'invalid signature' }, { status: 401 }, env) };
  try { return { ok: true, value: raw ? JSON.parse(raw) : {} }; }
  catch { return { ok: false, response: json({ ok: false, error: 'invalid json' }, { status: 400 }, env) }; }
}

async function persist(binding, key, value) {
  if (binding && typeof binding.put === 'function') await binding.put(key, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function enqueue(binding, value) {
  if (binding && typeof binding.send === 'function') await binding.send(value);
}

function providerFromPath(pathname) {
  const match = pathname.match(/^\/api\/webhooks\/([a-z0-9-]+)$/);
  return match?.[1] || null;
}

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: `${PRODUCT.name} Edge API`, version: '0.1.0' },
    paths: {
      '/healthz': { get: { summary: 'Health probe' } },
      '/readyz': { get: { summary: 'Readiness probe' } },
      '/api/config': { get: { summary: 'Public product and integration configuration' } },
      '/api/events': { post: { summary: 'Accept an event envelope' } },
      '/api/alerts': { post: { summary: 'Accept an alert envelope' } },
      '/api/webhooks/{provider}': { post: { summary: 'Accept a signed provider webhook' } },
    },
  };
}

export async function handleRequest(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(env) });
  if (url.pathname === '/healthz' && request.method === 'GET') return json({ ok: true, product: PRODUCT.org, status: 'healthy', requestId }, {}, env);
  if (url.pathname === '/readyz' && request.method === 'GET') return json({ ok: true, product: PRODUCT.org, configured: true, requestId }, {}, env);
  if (url.pathname === '/api/config' && request.method === 'GET') return json({ ok: true, product: PRODUCT, requestId }, {}, env);
  if (url.pathname === '/api/openapi.json' && request.method === 'GET') return json(openApiDocument(), {}, env);

  const provider = providerFromPath(url.pathname);
  if (provider && request.method === 'POST') {
    const parsed = await parseSignedJson(request, env); if (!parsed.ok) return parsed.response;
    const webhook = { id: crypto.randomUUID(), provider, product: PRODUCT.org, receivedAt: new Date().toISOString(), payload: parsed.value };
    await persist(env.STATE_KV, `webhook:${provider}:${webhook.id}`, webhook);
    ctx.waitUntil?.(enqueue(env.EVENT_QUEUE, { type: 'provider.webhook.received', webhook }));
    return json({ ok: true, accepted: true, webhookId: webhook.id, requestId }, { status: 202 }, env);
  }

  if ((url.pathname === '/api/events' || url.pathname === '/api/alerts') && request.method === 'POST') {
    const parsed = await parseSignedJson(request, env); if (!parsed.ok) return parsed.response;
    const kind = url.pathname.endsWith('/alerts') ? 'alert' : 'event';
    const envelope = { id: crypto.randomUUID(), product: PRODUCT.org, receivedAt: new Date().toISOString(), ...parsed.value };
    await persist(env.STATE_KV, `${kind}:${envelope.id}`, envelope);
    ctx.waitUntil?.(enqueue(kind === 'alert' ? (env.ALERT_QUEUE || env.EVENT_QUEUE) : env.EVENT_QUEUE, { type: `${kind}.received`, [kind]: envelope }));
    return json({ ok: true, accepted: true, [`${kind}Id`]: envelope.id, requestId }, { status: 202 }, env);
  }

  return json({ ok: false, error: 'not found', requestId }, { status: 404 }, env);
}

export default { fetch: handleRequest };
