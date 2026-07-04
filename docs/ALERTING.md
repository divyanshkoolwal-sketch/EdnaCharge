# Alerting

What pages us, how it routes, and the probes Render uses. Signal sources are
described in [`OBSERVABILITY.md`](OBSERVABILITY.md).

## Sentry alert rules

Configured in the Sentry project (per environment):

- **Error-rate spike** — issue events cross a rate threshold over a short window.
- **New issue** — a never-before-seen issue fingerprint appears.
- **Missing-DSN boot error** — a service booting in production without its Sentry
  DSN logs at **error** level (`initServiceSentry`); this is caught by log-based
  alerting, not Sentry itself, since Sentry is exactly what's disabled.

Sentry alerts also drive the GitHub issue pipeline
(`.github/workflows/sentry-issue.yml`, keyed on `SENTRY_ORG` / `SENTRY_PROJECT`),
which opens a tracking issue from an alert.

## On-call routing

Intended routing today is Sentry → **email + Slack** (via the Sentry Slack
integration; deploy/release notices use `SLACK_DEPLOY_WEBHOOK_URL`). PagerDuty /
OpsGenie escalation is a future step — wire the Sentry alert action to the pager
provider when on-call rotations exist.

## CI failure alerting

A failed GitHub Actions run (ci, codeql, or the Sentry-issue workflow itself)
notifies the team through GitHub's Actions notifications / the repo's configured
channel. A red `main` build is treated as an incident: fix-forward or revert.

## Health probes

Render uses the HTTP probes each service registers:

- `/healthz` — **liveness**: the process is up and serving. Returns 200 as soon as
  the server is listening.
- `/readyz` — **readiness**: dependencies (DB, Redis) are reachable. This is the
  `healthCheckPath` in `render.yaml` for edna-api and edna-csms; a failing
  `/readyz` holds a deploy from going live and marks the instance unhealthy.

The worker has no inbound port; its health is observed via `/metrics`, queue depth,
and job-failure logs.

## Alert conditions

| Condition                         | Signal source         | Severity | Route                           |
| --------------------------------- | --------------------- | -------- | ------------------------------- |
| Error-rate spike                  | Sentry                | high     | Slack + email (→ pager, future) |
| New Sentry issue                  | Sentry                | medium   | Slack + GitHub issue            |
| Missing Sentry DSN at prod boot   | error log             | high     | log-based alert                 |
| `/readyz` failing (DB/Redis down) | Render probe          | high     | Render + Slack                  |
| `/healthz` failing (process down) | Render probe          | critical | Render restart + Slack          |
| CI / CodeQL failure on `main`     | GitHub Actions        | medium   | GitHub notification             |
| Elevated request latency / 5xx    | Prometheus (`http_*`) | medium   | Grafana alert                   |

Severity is intent, not a contract — tune thresholds and routes per environment as
on-call maturity grows.
