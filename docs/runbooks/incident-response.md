# Incident Response Runbook

A short loop for a production incident. Signal details are in
[`../OBSERVABILITY.md`](../OBSERVABILITY.md); routing is in
[`../ALERTING.md`](../ALERTING.md).

## 1. Confirm scope

- Check `/readyz` on edna-api and edna-csms. A failing `/readyz` means a dependency
  (DB or Redis) is down — the process is up but not serving. `/healthz` failing
  means the process itself is down.
- Pull `/metrics` from the affected service: watch `http_requests_total` by
  `status` (5xx rate) and the `http_request_duration_seconds` histogram (latency),
  plus event-loop lag from the default metrics.

## 2. Trace the failing request

Every request carries an `x-request-id` (echoed on the response header). Grab it
from a failing client response, then trace it across services:

- Grep `reqId=<uuid>` in the **api** logs for the request that failed.
- The id is threaded onto BullMQ job data, so grep the same `reqId` in the
  **worker** logs to follow the background work it scheduled (Stripe capture, push,
  etc.). This is how you connect an api → worker failure into one story.

## 3. Find the error in Sentry

Open the Sentry project (matching the current `NODE_ENV`/environment). Sort by
recent / by event-rate spike; the issue should carry the service tag and stack.
PII is scrubbed, so correlate by `reqId`, timestamp, route, and release rather than
by user identifiers. A new-issue or error-spike alert may already have opened a
GitHub tracking issue.

## 4. Mitigate

- **Rollback** — in the Render dashboard, roll the affected service back to the
  last healthy deploy (Deploys → prior successful deploy → Rollback). `main` is
  auto-deploy, so also revert or hold the offending commit so the next push doesn't
  redeploy the break.
- If a single bad flag is implicated, flip its `FLAG_<NAME>` env var off and
  redeploy rather than rolling back code (see [`../FEATURE_FLAGS.md`](../FEATURE_FLAGS.md)).

## 5. Dependency outages

| Symptom                                             | Check                                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Payments failing / captures stuck                   | Stripe status; `STRIPE_*` keys and webhook secrets present; worker logs for capture/settle jobs.                                       |
| Chargers can't start / RemoteStart silent           | csms is a **single instance** by design — confirm it's up and holds the socket; check the `ocpp-commands` queue and `CSMS_PUBLIC_URL`. |
| Jobs not running / `/readyz` red / queue backing up | Redis (Upstash) reachability and `REDIS_URL`; worker connection logs; BullMQ queue depth.                                              |
| DB errors / `/readyz` red                           | Supabase/Postgres reachability and `DATABASE_URL`; connection-pool exhaustion.                                                         |

## 6. After

Keep the reproducing `reqId`, Sentry issue link, and the rollback point in the
incident record. Close out the auto-opened GitHub issue with the root cause and the
fix-forward PR.
