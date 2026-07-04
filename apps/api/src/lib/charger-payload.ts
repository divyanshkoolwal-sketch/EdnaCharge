/** @file apps/api/src/lib/charger-payload.ts. */
import type { Prisma } from '@edna/db';

const publicUserSummarySelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const safeChargerSelect = {
  id: true,
  hostId: true,
  title: true,
  photoUrl: true,
  addressLine1: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  lat: true,
  lng: true,
  connectorType: true,
  powerKw: true,
  hardwareTier: true,
  pricePerKwhCents: true,
  pricePerHourCents: true,
  houseRules: true,
  status: true,
  instantAvailable: true,
  published: true,
  availability: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChargerSelect;

export const safeChargerWithHostSelect = {
  ...safeChargerSelect,
  host: { select: publicUserSummarySelect },
} satisfies Prisma.ChargerSelect;

export const hostOwnedChargerSelect = {
  ...safeChargerSelect,
  gateCode: true,
} satisfies Prisma.ChargerSelect;

export const chatChargerSelect = {
  ...safeChargerWithHostSelect,
  gateCode: true,
} satisfies Prisma.ChargerSelect;
