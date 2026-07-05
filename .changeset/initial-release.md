---
'@edna/api': minor
'@edna/csms': minor
'@edna/worker': minor
---

First tagged EdnaCharge release — establishes the changesets-driven release
history for the backend services (api, csms, worker).

Ships the production-readiness work: observability (Prometheus metrics,
`X-Request-ID` correlation, `opossum` circuit breaking, server-side PostHog
analytics), a GDPR/CCPA data-export path, an OpenAPI contract, and an enforced
quality toolchain (blocking secret-scan, module-boundary, naming, and
dead-feature-flag gates).
