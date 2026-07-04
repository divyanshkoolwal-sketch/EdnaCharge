/** @file apps/api/src/lib/access.ts. */
import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { prisma } from '@edna/db';

export type AccessRole = 'driver' | 'host';

export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashInviteCode(raw: string): string {
  return createHash('sha256').update(normalizeInviteCode(raw)).digest('hex');
}

export async function userHasAccess(userId: string, role: AccessRole): Promise<boolean> {
  const row = await prisma.userAccessGrant.findUnique({
    where: { userId_role: { userId, role } },
    select: { userId: true },
  });
  return row != null;
}

export async function requireUserAccess(userId: string, role: AccessRole): Promise<void> {
  if (await userHasAccess(userId, role)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Join the ${role} waitlist or redeem an invite code to continue.`,
  });
}

/**
 * Grant host access alongside the roles flip when Stripe onboarding completes.
 * Host procedures gate on UserAccessGrant (requireUserAccess), NOT User.roles —
 * without this, a driver-invited user who finished Stripe onboarding had the
 * host role but no grant and was FORBIDDEN on every host action.
 */
export async function grantHostAccess(userId: string): Promise<void> {
  await prisma.userAccessGrant.upsert({
    where: { userId_role: { userId, role: 'host' } },
    create: { userId, role: 'host', source: 'stripe_onboarding' },
    update: {},
  });
}

export async function requireAnyUserAccess(userId: string): Promise<void> {
  const count = await prisma.userAccessGrant.count({ where: { userId } });
  if (count > 0) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Join the waitlist or redeem an invite code to continue.',
  });
}
