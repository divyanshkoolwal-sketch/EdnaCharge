/**
 * Tests the JS-level Sentry reporter's pure logic: DSN parsing and event
 * shaping (Error vs message vs object). Network send is fire-and-forget and
 * fail-safe, exercised separately on-device.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  // The module reads __DEV__ at load; RN provides it globally, vitest doesn't.
  vi.stubGlobal('__DEV__', false);
});

import { parseDsn, buildEvent, Sentry } from '../src/lib/sentry';

describe('parseDsn', () => {
  it('parses a valid DSN into key/host/project', () => {
    const p = parseDsn('https://abc123@o42.ingest.us.sentry.io/987654');
    expect(p).toEqual({ publicKey: 'abc123', host: 'o42.ingest.us.sentry.io', projectId: '987654' });
  });
  it('returns null for a malformed DSN', () => {
    expect(parseDsn('')).toBeNull();
    expect(parseDsn('not-a-dsn')).toBeNull();
    expect(parseDsn('http://insecure@host/1')).toBeNull(); // must be https
  });
});

describe('buildEvent', () => {
  it('shapes an Error into a Sentry exception with a stack', () => {
    const e = buildEvent(new TypeError('boom'));
    expect(e.level).toBe('error');
    expect(e.platform).toBe('javascript');
    expect((e.exception as any).values[0]).toMatchObject({ type: 'TypeError', value: 'boom' });
    expect((e.extra as any).stack).toBeTruthy();
    expect(typeof e.event_id).toBe('string');
    expect((e.event_id as string).length).toBe(32);
  });
  it('shapes a string into a message event', () => {
    const e = buildEvent('hello', 'info');
    expect(e.level).toBe('info');
    expect(e.message).toBe('hello');
    expect(e.exception).toBeUndefined();
  });
  it('stringifies a non-error, non-string input', () => {
    const e = buildEvent({ foo: 'bar' });
    expect(e.message).toBe('{"foo":"bar"}');
  });
  it('redacts emails, JWTs, and bearer tokens from message + stack values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36';
    const e = buildEvent(new Error(`login failed for user@example.com with ${jwt}`));
    const value = (e.exception as any).values[0].value as string;
    expect(value).not.toContain('user@example.com');
    expect(value).not.toContain(jwt);
    expect(value).toContain('[email-scrubbed]');
    expect(value).toContain('[jwt-scrubbed]');

    const msg = buildEvent('Authorization: Bearer abc.def.ghi123456');
    expect(msg.message).not.toContain('abc.def.ghi123456');
    expect(msg.message as string).toContain('[scrubbed]');
  });

  it('includes user context and route breadcrumbs', () => {
    Sentry.setUser({ id: 'user-1', email: 'driver@example.com' });
    Sentry.addBreadcrumb({ category: 'navigation', message: '/(driver)/map' });
    const e = buildEvent(new Error('boom'));
    expect(e.user).toEqual({ id: 'user-1', email: '[email-scrubbed]' });
    expect(e.breadcrumbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'navigation', message: '/(driver)/map' }),
      ]),
    );
  });
});
