/** @file packages/db/test/fixtures/factories.ts. */
import { prisma } from '../../src/index.js';
import type { ConnectorType, HardwareTier } from '@prisma/client';

let seq = 0;
const nextSeq = () => ++seq;

async function createUser(overrides: Partial<{ email: string; fullName: string; roles: ('driver' | 'host')[] }> = {}) {
  const n = nextSeq();
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}-${Date.now()}@test.local`,
      fullName: overrides.fullName ?? `Test User ${n}`,
      roles: overrides.roles ?? ['driver'],
    },
  });
}

export async function createDriver(overrides: Partial<{ email: string }> = {}) {
  const user = await createUser({ ...overrides, roles: ['driver'] });
  await prisma.driverProfile.create({
    data: {
      userId: user.id,
      vehicleMake: 'Tesla',
      vehicleModel: 'Model 3',
      vehicleYear: 2023,
      connectorType: 'nacs',
    },
  });
  return user;
}

export async function createHost(overrides: Partial<{ email: string }> = {}) {
  const user = await createUser({ ...overrides, roles: ['driver', 'host'] });
  await prisma.hostProfile.create({
    data: {
      userId: user.id,
      legalName: user.fullName,
      dob: new Date('1990-01-01'),
      addressLine1: '123 Test Ln',
      city: 'Pleasanton',
      state: 'CA',
      postalCode: '94566',
    },
  });
  return user;
}

export async function createCharger(
  hostId: string,
  overrides: Partial<{
    title: string;
    lat: number;
    lng: number;
    connectorType: ConnectorType;
    powerKw: number;
    hardwareTier: HardwareTier;
    pricePerKwhCents: number;
    published: boolean;
  }> = {},
) {
  return prisma.charger.create({
    data: {
      hostId,
      title: overrides.title ?? `Charger ${nextSeq()}`,
      addressLine1: '500 Main St',
      city: 'Pleasanton',
      state: 'CA',
      postalCode: '94566',
      lat: overrides.lat ?? 37.6624,
      lng: overrides.lng ?? -121.8747,
      connectorType: overrides.connectorType ?? 'j1772',
      powerKw: overrides.powerKw ?? 7.2,
      hardwareTier: overrides.hardwareTier ?? 'tier_3_native',
      pricePerKwhCents: overrides.pricePerKwhCents ?? 28,
      published: overrides.published ?? true,
      status: 'available',
    },
  });
}

export async function createBooking(params: {
  chargerId: string;
  driverId: string;
  startAt?: Date;
  endAt?: Date;
  preauthCents?: number;
}) {
  const start = params.startAt ?? new Date(Date.now() + 60 * 60 * 1000);
  const end = params.endAt ?? new Date(start.getTime() + 60 * 60 * 1000);
  return prisma.booking.create({
    data: {
      chargerId: params.chargerId,
      driverId: params.driverId,
      startAt: start,
      endAt: end,
      estimatedKwh: 7.2,
      estimatedCostCents: 202,
      platformFeeCents: 30,
      preauthAmountCents: params.preauthCents ?? 232,
      autoDeclineAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}
