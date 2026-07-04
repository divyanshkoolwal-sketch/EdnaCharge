# Observability

How the backend services (api, csms, worker) and the mobile app emit signals, and
how to read them. Everything here is on by default; production hardening is noted
inline.

## Structured logging

Node services use one shared pino logger, `createServiceLogger(service)` from
`packages/server-utils` (`src/logger.ts`). It stamps `{ service }` on every line,
reads `LOG_LEVEL` (default `info`), and pretty-prints in dev / emits JSON in prod.

PII/secrets that leak into logged objects are redacted by `REDACT_PATHS` (email,
phone, password, token, secret, authorization — plus `*.`-nested and
`req.headers.authorization` variants) with `censor: '<redacted>'`. This is a
best-effort net that complements the Sentry scrubber; do not rely on it as a
reason to log PII.

The mobile app has its own structured logger, `apps/mobile/src/lib/logger.ts`,
that scrubs PII from messages and objects before they reach the console or crash
reporter.

## Request correlation

Every HTTP request carries an `x-request-id`. Each service reads an incoming
`x-request-id`, or generates one with `crypto.randomUUID()` when absent, echoes it
back on the response header, and binds it as `reqId` on a per-request **child**
logger — so every log line for that request is tagged.

Within a single service, grep `reqId=<uuid>` to follow one request across its log
lines. Background jobs are **not** auto-correlated: to carry the id into the
worker, put `reqId` on the BullMQ job data when you enqueue (`getRequestId(req)`
from `@edna/server-utils`) and log it in the job handler. That threading is the
intended pattern, not automatic today.

## Metrics

Each Node service exposes Prometheus metrics at `GET /metrics`
(`Content-Type: text/plain; version=0.0.4`) via `prom-client`:

- `collectDefaultMetrics()` — default Node/process metrics (event-loop lag, heap,
  GC, handles).
- `http_requests_total{service,method,route,status}` — request counter.
- `http_request_duration_seconds` — request latency histogram.

`/metrics` is unauthenticated and intended for a **private network or a scrape
sidecar** — do not expose it on the public internet. Scrape it with Prometheus or
a Grafana Agent pointed at each service's internal address, e.g.

```yaml
scrape_configs:
  - job_name: edna-api
    static_configs: [{ targets: ['edna-api:3000'] }]
    metrics_path: /metrics
```

## Error tracking

Sentry is wired through `packages/server-utils/src/sentry.ts`
(`initServiceSentry`). PII is scrubbed by `scrubSentryValue` in `beforeSend` /
`beforeBreadcrumb` — emails, phones, `Bearer` tokens, and `sk_(test|live)_` keys
are masked, and event message, `extra`, request headers, and thrown-error `.value`
are all run through it. `sendDefaultPii` is off and `tracesSampleRate` is `0.1`.

A missing DSN in production is logged at **error** level (a service running with no
error tracking should trip alerting, not hide among warnings); in dev it is a warn.

`SENTRY_ORG` and `SENTRY_PROJECT` feed the Sentry → GitHub pipeline: the workflow
`.github/workflows/sentry-issue.yml` opens GitHub issues from Sentry alerts. See
[`ALERTING.md`](ALERTING.md).

## Deployment observability

Integration points the team wires up per environment:

- **Dashboards** — Grafana (Prometheus data source, per-service panels for the
  `http_*` metrics) and Sentry issue/release dashboards.
- **Deploy notifications** — `SLACK_DEPLOY_WEBHOOK_URL` posts deploy/release events
  to a Slack channel.

## Profiling

Run clinic.js against a running service:

```bash
pnpm profile:api      # clinic doctor / clinic flame against the api
pnpm profile:csms
pnpm profile:worker
```

`clinic doctor` diagnoses event-loop / GC / I/O issues; `clinic flame` produces a
CPU flamegraph. If clinic is unavailable, fall back to a raw V8 CPU profile:

```bash
node --cpu-prof --cpu-prof-dir=./profiles <entrypoint>
```

and load the `.cpuprofile` in Chrome DevTools → Performance.

## N+1 / slow queries

`packages/db` uses Prisma event-based logging in development: slow queries and
duplicated (N+1) queries are logged to stdout with their SQL and duration. Watch
for the same query text repeating within one request (`reqId`) — that is the N+1
signal. This logging is dev-only; do not rely on it in production, where slow
queries surface via the metrics histogram and Sentry performance traces instead.
