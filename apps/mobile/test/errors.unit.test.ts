/**
 * Tests the mobile error-handler's heuristics for detecting raw server
 * stacks vs friendly messages. Pure logic — no React, no native modules.
 */

import { describe, it, expect, vi } from 'vitest';

// vi.mock factories are hoisted, so any value they reference must be
// declared via vi.hoisted (so vitest knows to hoist it too).
const { alertMock } = vi.hoisted(() => ({ alertMock: vi.fn() }));

vi.mock('react-native', () => ({
  Alert: { alert: alertMock },
}));
vi.mock('../src/state/auth', () => ({
  useAuth: {
    getState: () => ({
      signOut: vi.fn(async () => {}),
      setSession: vi.fn(),
    }),
  },
}));
vi.mock('../src/lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
  },
}));

import { handleError } from '../src/lib/errors';

describe('handleError — server-stack detection', () => {
  it('collapses Prisma errors into a clean message', () => {
    alertMock.mockClear();
    const longPrismaErr = new Error(
      "Invalid `prisma.user.findFirst()` invocation in /Users/x/api/src/trpc.ts:54:32\n\n" +
        "  51     : `user-${authUser.id}@ednacharge.local`;\n" +
        "  52 const fullName = authUser.name?.trim() || email.split('@')[0] || 'user';\n" +
        "Can't reach database server at `localhost:54322`",
    );
    handleError(longPrismaErr, { feature: 'Payment methods' });
    const call = alertMock.mock.calls.at(-1);
    expect(call).toBeTruthy();
    const message = call?.[1] ?? '';
    expect(message).not.toMatch(/prisma/i);
    expect(message).not.toMatch(/trpc\.ts/);
    expect(message).toMatch(/temporarily unavailable|Payment methods/);
  });

  it('keeps zod field errors readable', () => {
    alertMock.mockClear();
    const zodErr = new Error(
      JSON.stringify([
        { path: ['vehicleYear'], message: 'Required' },
        { path: ['fullName'], message: 'Required' },
      ]),
    );
    handleError(zodErr, { feature: 'Profile' });
    const call = alertMock.mock.calls.at(-1);
    expect(call?.[1]).toMatch(/vehicleYear: Required/);
  });
});
