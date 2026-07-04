/** @file apps/api/src/lib/availability.ts. */
import { TRPCError } from '@trpc/server';
import { isWindowAvailable } from '@edna/schemas';

// The window-evaluation logic lives in @edna/schemas so the mobile client can run
// the exact same check before submitting. This module only adds the server-side
// throwing wrapper.
export { isWindowAvailable, parseAvailability, type AvailabilityWindow } from '@edna/schemas';

export function assertWindowAvailable(value: unknown, start: Date, end: Date): void {
  if (isWindowAvailable(value, start, end)) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'This charger is not available for that time window.',
  });
}
