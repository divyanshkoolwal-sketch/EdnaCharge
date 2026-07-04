/** @file packages/server-utils/src/request-id.ts — X-Request-ID correlation for Fastify. */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';

export const REQUEST_ID_HEADER = 'x-request-id';

type WithRequestId = { requestId: string; logger: Logger };

/**
 * Register request-id correlation on a Fastify instance: honour an inbound
 * `x-request-id` (from an upstream proxy or the mobile client) or mint a UUID,
 * echo it back on the response, and attach a `reqId`-bound child logger at
 * `request.logger`. Read `request.requestId` in handlers (and put it on any
 * BullMQ job you enqueue) so background work and downstream services correlate
 * to the originating request.
 */
export function registerRequestId(app: FastifyInstance, baseLogger: Logger): void {
  app.decorateRequest('requestId', '');
  app.decorateRequest('logger', null);
  app.addHook('onRequest', async (req, reply) => {
    const raw = req.headers[REQUEST_ID_HEADER];
    const incoming = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    const id = incoming && incoming.length > 0 && incoming.length <= 200 ? incoming : randomUUID();
    const decorated = req as unknown as WithRequestId;
    decorated.requestId = id;
    decorated.logger = baseLogger.child({ reqId: id });
    reply.header(REQUEST_ID_HEADER, id);
  });
}

/** Read the correlation id off a Fastify request (empty string if unset). */
export function getRequestId(req: unknown): string {
  return (req as Partial<WithRequestId>)?.requestId ?? '';
}
