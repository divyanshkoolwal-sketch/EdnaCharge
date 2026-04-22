import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/index.js';
import { createDriver, createHost, createCharger, createBooking } from './fixtures/factories.js';

// Real RLS enforcement happens when a request carries a user JWT against Supabase.
// These tests verify the DDL-level invariants that back RLS: schema shape, FK cascades,
// and party-membership queries the policies rely on. Actual policy enforcement is
// exercised by a Supabase integration harness that runs under a per-user JWT — this
// file is the Prisma-level smoke.

beforeAll(async () => {
  await prisma.$connect();
});

describe('data model invariants', () => {
  it('allows driver + host roles to coexist on one user', async () => {
    const u = await createHost();
    expect(u.roles).toContain('driver');
    expect(u.roles).toContain('host');
  });

  it('cascades charger → booking → chat thread relations on delete', async () => {
    const host = await createHost();
    const driver = await createDriver();
    const charger = await createCharger(host.id);
    const booking = await createBooking({ chargerId: charger.id, driverId: driver.id });
    await prisma.chatThread.create({ data: { bookingId: booking.id } });

    await prisma.charger.delete({ where: { id: charger.id } });

    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    const t = await prisma.chatThread.findUnique({ where: { bookingId: booking.id } });
    expect(b).toBeNull();
    expect(t).toBeNull();
  });

  it('enforces booking uniqueness of reviews per (booking, author)', async () => {
    const host = await createHost();
    const driver = await createDriver();
    const charger = await createCharger(host.id);
    const booking = await createBooking({ chargerId: charger.id, driverId: driver.id });

    await prisma.review.create({
      data: { bookingId: booking.id, authorId: driver.id, subjectId: host.id, stars: 5 },
    });
    await expect(
      prisma.review.create({
        data: { bookingId: booking.id, authorId: driver.id, subjectId: host.id, stars: 4 },
      }),
    ).rejects.toThrow();
  });

  it('resolves booking parties via the charger.hostId / booking.driverId pair', async () => {
    const host = await createHost();
    const driver = await createDriver();
    const charger = await createCharger(host.id);
    const booking = await createBooking({ chargerId: charger.id, driverId: driver.id });

    const full = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { charger: true },
    });
    expect(full.driverId).toBe(driver.id);
    expect(full.charger.hostId).toBe(host.id);
  });
});
