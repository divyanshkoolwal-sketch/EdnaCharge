/** @file packages/schemas/src/availability.ts. */
// Pure availability-window logic shared by the API (server enforcement) and the
// mobile app (client-side pre-check), so both evaluate a booking window against
// the host's weekly schedule identically, in the pricing timezone.
import { PRICING_TZ } from './pricing.js';

export type AvailabilityWindow = { dow: number; start: string; end: string };

const MINUTE_MS = 60_000;
const END_OF_DAY = 24 * 60;
const WEEKDAY_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const LOCAL_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: PRICING_TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Whether the JS engine's Intl actually applies the IANA timezone (older Hermes
 * builds ignore the `timeZone` option). Callers that can't trust the result —
 * i.e. the mobile client — should skip a client-side check when this is false and
 * defer to the server. Verified by formatting a known UTC instant.
 */
export function availabilityTimeZoneSupported(): boolean {
  try {
    // 2021-01-01T00:00Z is 2020-12-31 16:00 in America/Los_Angeles (PST, -8).
    const parts = LOCAL_TIME.formatToParts(new Date(Date.UTC(2021, 0, 1, 0, 0)));
    const hour = parts.find((p) => p.type === 'hour')?.value;
    return hour === '16';
  } catch {
    return false;
  }
}

function parseMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function parseAvailability(value: unknown): AvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    if (
      typeof r.dow !== 'number' ||
      typeof r.start !== 'string' ||
      typeof r.end !== 'string' ||
      r.dow < 0 ||
      r.dow > 6 ||
      parseMinute(r.start) == null ||
      parseMinute(r.end) == null
    ) {
      return [];
    }
    return [{ dow: r.dow, start: r.start, end: r.end }];
  });
}

function localDowMinute(at: Date): { dow: number; minute: number } | null {
  const parts = LOCAL_TIME.formatToParts(at);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const dow = weekday ? WEEKDAY_DOW[weekday] : undefined;
  if (dow == null || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { dow, minute: (hour === 24 ? 0 : hour) * 60 + minute };
}

function containsLocalMinute(rows: AvailabilityWindow[], dow: number, minute: number): boolean {
  return rows.some((row) => {
    const start = parseMinute(row.start);
    const endRaw = parseMinute(row.end);
    if (start == null || endRaw == null) return false;
    // Treat an end of 23:59 as end-of-day (24:00). Legacy "all day" presets used
    // 23:59 to mean midnight; without this the final minute of the day — and any
    // booking window crossing it — is wrongly rejected as unavailable.
    const end = endRaw === 23 * 60 + 59 ? END_OF_DAY : endRaw;
    if (start === end) return false;
    if (start < end) return row.dow === dow && minute >= start && minute < end;
    const previousDow = (dow + 6) % 7;
    return (row.dow === dow && minute >= start) || (row.dow === previousDow && minute < end);
  });
}

export function isWindowAvailable(value: unknown, start: Date, end: Date): boolean {
  const rows = parseAvailability(value);
  if (rows.length === 0) return true;
  if (end <= start) return false;
  const firstMinute = Math.floor(start.getTime() / MINUTE_MS) * MINUTE_MS;
  for (let t = firstMinute; t < end.getTime(); t += MINUTE_MS) {
    const local = localDowMinute(new Date(t));
    if (!local || !containsLocalMinute(rows, local.dow, local.minute)) return false;
  }
  return true;
}
