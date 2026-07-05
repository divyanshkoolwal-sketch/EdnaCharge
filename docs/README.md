# EdnaCharge Docs

These are the current docs for agents and humans.

## Current

- [`AGENT_CONTEXT.md`](AGENT_CONTEXT.md) - operating manual, architecture, conventions, and high-risk areas.
- [`RUNBOOK.md`](RUNBOOK.md) - local setup, commands, verification, and troubleshooting.
- [`APP_SURFACE.md`](APP_SURFACE.md) - current product flows and user-facing surfaces.
- [`DECISIONS.md`](DECISIONS.md) - active technical/product decisions that affect implementation.
- [`SECURITY.md`](SECURITY.md) - security boundaries, secrets policy, and production guardrails.
- [`todo.md`](todo.md) - the only place for explicitly scoped open work.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) - production deployment and smoke runbook.

## Operations & Observability

- [`OBSERVABILITY.md`](OBSERVABILITY.md) - logging, request-id tracing, `/metrics`, Sentry, profiling.
- [`ALERTING.md`](ALERTING.md) - alert conditions, severities, and routing.
- [`PRIVACY.md`](PRIVACY.md) - GDPR/CCPA export + deletion and PII scrubbing.
- [`FEATURE_FLAGS.md`](FEATURE_FLAGS.md) - the env-driven feature-flag system.
- [`openapi.yaml`](openapi.yaml) - HTTP surface + tRPC router inventory.

## Runbooks

- [`runbooks/credentials-template.md`](runbooks/credentials-template.md) - sanitized secret checklist.
- [`runbooks/testflight.md`](runbooks/testflight.md) - iOS TestFlight flow.
- [`runbooks/repo-settings.md`](runbooks/repo-settings.md) - admin-only GitHub settings (branch protection, scanning).
- [`runbooks/incident-response.md`](runbooks/incident-response.md) - tracing a failing request across services.
