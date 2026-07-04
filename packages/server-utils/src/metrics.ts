/** @file packages/server-utils/src/metrics.ts — Prometheus metrics registry + Fastify wiring. */
import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

// One process-wide registry. Each service registers it once at boot with its own
// `service` default label, so scraped series are attributable per service.
export const metricsRegistry = new Registry();

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

let defaultsStarted = false;

/**
 * Expose `GET /metrics` (Prometheus exposition, text/plain v0.0.4) and record a
 * counter + latency histogram for every response. Node process defaults
 * (event-loop lag, heap, GC, handles) are collected once. Intended to be scraped
 * over a private network / sidecar — do not expose /metrics publicly.
 */
export function registerMetrics(app: FastifyInstance, service: string): void {
  metricsRegistry.setDefaultLabels({ service });
  if (!defaultsStarted) {
    collectDefaultMetrics({ register: metricsRegistry });
    defaultsStarted = true;
  }

  app.addHook('onResponse', async (req, reply) => {
    // Use ONLY the matched route template (e.g. /trpc/:path). Falling back to the
    // raw URL would let 404-probing traffic explode the `route` label cardinality
    // (unbounded series → memory + scrape bloat), so bucket unmatched requests to
    // a single constant.
    const matched = req.routeOptions?.url;
    const route = matched ? matched.split('?')[0] : 'unmatched';
    const labels = { method: req.method, route, status: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, (reply.elapsedTime ?? 0) / 1000);
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
}
