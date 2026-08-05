# hhm-infra

Docker Compose, Kubernetes, Kustomize, Argo CD, Terraform, observability, and runbooks for Hacker House Medellín.

**Product:** Hacker House Medellín — Operations software for an entrepreneur coliving and coworking community.

Run rooms, desks, member stays, community events, access workflows, and day-to-day operations for a hacker house in Medellín, Colombia.

## Safety and production boundary

The bootstrap does not implement payments, identity verification, door-control hardware, or Colombian lodging compliance. Add those only after security and local regulatory review.

This repository is an executable bootstrap, not a production deployment. Before live
use, add authentication, tenant authorization, rate limits, durable migrations,
observability, backups, incident response, dependency review, and secret management.
            ## Services

            - `hhm-api`
- `hhm-mash-web`
- `hhm-leptos-web`
- `hhm-dioxus-web`
- `hhm-sync`

            The checked-in images use version tags as placeholders. Production GitOps must pin
            immutable digests produced by verified CI, use an external secrets provider, and
            configure managed PostgreSQL/Supabase, backups, TLS, network policy, autoscaling,
            dashboards, and alerts.

            ```bash
            ./scripts/validate.sh
            docker compose up
            ```

## Cloudflare Worker edge gateway

The `cloudflare-worker/` package provides a Wrangler-managed edge gateway with health checks, signed webhook intake, validation, queue fan-out, security headers, unit tests, and a dry-run deployment command. The Worker is intentionally isolated from cluster infrastructure so it can be reviewed and deployed independently.
