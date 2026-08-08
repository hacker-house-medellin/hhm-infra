const encoder = new TextEncoder();

export const DEFAULT_SIGNATURE_MAX_AGE_SECONDS = 300;

function toHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function parseTimestamp(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{10}(?:\d{3})?$/.test(raw)) return null;
  const numeric = Number(raw);
  const milliseconds = raw.length === 13 ? numeric : numeric * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  return { raw, milliseconds };
}

function signatureMaxAgeSeconds(env = {}) {
  const configured = Number(env.SIGNATURE_MAX_AGE_SECONDS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SIGNATURE_MAX_AGE_SECONDS;
  }
  return Math.min(3600, Math.max(30, Math.floor(configured)));
}

export async function signBody(rawBody, secret, timestamp = null) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new TypeError('a non-empty HMAC secret is required');
  }
  const payload = timestamp === null ? rawBody : `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function verifyRequiredSignature(request, rawBody, env = {}, now = Date.now()) {
  const secret = env.WEBHOOK_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    return { ok: false, reason: 'server-not-configured' };
  }

  const timestamp = parseTimestamp(request.headers.get('x-signature-timestamp'));
  if (!timestamp) return { ok: false, reason: 'invalid-timestamp' };

  const ageMilliseconds = Math.abs(now - timestamp.milliseconds);
  if (ageMilliseconds > signatureMaxAgeSeconds(env) * 1000) {
    return { ok: false, reason: 'stale-signature' };
  }

  const supplied = request.headers
    .get('x-signature-sha256')
    ?.replace(/^sha256=/, '')
    .toLowerCase();
  if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)) {
    return { ok: false, reason: 'invalid-signature' };
  }

  const expected = await signBody(rawBody, secret, timestamp.raw);
  if (!constantTimeEqual(expected, supplied)) {
    return { ok: false, reason: 'invalid-signature' };
  }
  return { ok: true, reason: null };
}
