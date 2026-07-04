/** @file packages/server-utils/src/circuit-breaker.ts — opossum circuit-breaker factory. */
import CircuitBreaker from 'opossum';
import type { Logger } from 'pino';

export type BreakerOptions = {
  /** Human name used in logs and opossum's own group metrics. */
  name: string;
  /** Fail a call that takes longer than this (ms). Default 5000. */
  timeoutMs?: number;
  /** Trip the breaker once this % of recent calls fail. Default 50. */
  errorThresholdPercentage?: number;
  /** How long to stay open before a half-open trial (ms). Default 15000. */
  resetTimeoutMs?: number;
  logger?: Logger;
};

/**
 * Wrap an async external dependency call (Mapbox, Stripe, …) in an opossum
 * circuit breaker so a failing/slow dependency fails fast and self-heals instead
 * of piling up timeouts and exhausting the event loop. The breaker opens after
 * `errorThresholdPercentage` of calls fail, then half-opens after
 * `resetTimeoutMs` to probe recovery. Call `breaker.fire(...args)`.
 */
export function createBreaker<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  opts: BreakerOptions,
): CircuitBreaker<TArgs, TResult> {
  const breaker = new CircuitBreaker(action, {
    name: opts.name,
    timeout: opts.timeoutMs ?? 5000,
    errorThresholdPercentage: opts.errorThresholdPercentage ?? 50,
    resetTimeout: opts.resetTimeoutMs ?? 15000,
  });
  const log = opts.logger;
  if (log) {
    breaker.on('open', () => log.warn({ breaker: opts.name }, 'circuit breaker opened'));
    breaker.on('halfOpen', () => log.info({ breaker: opts.name }, 'circuit breaker half-open'));
    breaker.on('close', () => log.info({ breaker: opts.name }, 'circuit breaker closed'));
  }
  return breaker;
}
