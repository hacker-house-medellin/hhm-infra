const encoder = new TextEncoder();

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function signBody(rawBody, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)));
}

export async function verifyOptionalSignature(request, rawBody, env = {}) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret) return true;
  const supplied = request.headers.get('x-signature-sha256')?.replace(/^sha256=/, '').toLowerCase();
  if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = await signBody(rawBody, secret);
  return constantTimeEqual(expected, supplied);
}
