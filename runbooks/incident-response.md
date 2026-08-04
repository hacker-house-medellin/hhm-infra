# Incident response

1. Confirm the affected service, tenant scope, and start time.
2. Preserve immutable logs and deployment metadata without copying secrets.
3. Disable risky mutations or provider ingestion before broad rollback.
4. Roll back by immutable image digest; do not deploy an unreviewed local image.
5. Verify health, WebSocket fanout, database consistency, and queued work.
6. Record customer impact, root cause, corrective actions, and evidence links.

For data exposure or credential compromise, follow the jurisdiction-appropriate
breach and provider-rotation process; do not place sensitive evidence in a public
issue.
