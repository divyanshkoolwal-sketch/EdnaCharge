/** @file apps/api/src/lib/auto-decline.ts. */
export function autoDeclineJobId(bookingId: string): string {
  return `auto_decline_${bookingId}`;
}
