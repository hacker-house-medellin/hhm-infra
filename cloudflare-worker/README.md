# HHM Cloudflare Worker

Edge booking intake, occupancy events, access webhooks, and resident notification fan-out for Hacker House Medellín.

## Routes

- `GET /healthz`
- `GET /readyz`
- `GET /api/config`
- `GET /api/openapi.json`
- `POST /api/events`
- `POST /api/alerts`
- `POST /api/webhooks/:provider`

## Fail-closed write boundary

Every `POST` requires all of the following:

- a non-empty `WEBHOOK_SECRET` stored as a Worker secret;
- a `STATE_KV` binding with `put` support;
- an `EVENT_QUEUE` binding with `send` support;
- `content-type: application/json`;
- `x-signature-timestamp`, expressed as Unix seconds or milliseconds; and
- `x-signature-sha256`, expressed as `sha256=<64 lowercase hex characters>`.

The signature is the lowercase hexadecimal HMAC-SHA-256 of:

```text
<timestamp>.<exact raw request body>
```

The default replay window is 300 seconds and can be narrowed or widened, up to one hour, with `SIGNATURE_MAX_AGE_SECONDS`. Missing bindings make `/readyz` and every write return `503`; missing, invalid, or stale signatures return `401`.

`ALERT_QUEUE` is optional. Alerts use it when present and otherwise fall back to `EVENT_QUEUE`.

## CORS

`CORS_ORIGINS` is a comma-separated list of exact origins. Wildcard values are deliberately ignored, and an unlisted preflight receives `403`. Keep the value empty until the actual HHM web origins are verified.

## Configure without committing credentials

```bash
cd cloudflare-worker
npm install
npm run verify
wrangler secret put WEBHOOK_SECRET
```

Create the KV namespace and queues separately, replace only their non-secret identifiers in `wrangler.toml`, then confirm `/readyz` before routing production traffic. Prefer native Worker bindings for KV, Queues, and R2; do not store API tokens, S3 access keys, or resident data in Git, workflow files, command arguments, or test fixtures.

For local development, place secrets in an untracked `.dev.vars` file. Unit tests use in-memory synthetic bindings and never require Cloudflare credentials.
