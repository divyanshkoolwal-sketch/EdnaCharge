import { z } from 'zod';
import { ConnectorTypeZ, HardwareTierZ } from './enums.js';

const ChargerCreateFieldsZ = z
  .object({
    title: z.string().min(3).max(80),
    photoUrl: z.string().url().optional(),
    addressLine1: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(3),
    country: z.string().length(2).default('US'),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    connectorType: ConnectorTypeZ,
    powerKw: z.number().positive().max(50),
    hardwareTier: HardwareTierZ,
    pricePerKwhCents: z.number().int().nonnegative().optional(),
    pricePerHourCents: z.number().int().nonnegative().optional(),
    houseRules: z.string().max(500).optional(),
    instantAvailable: z.boolean().default(false),
    availability: z
      .array(
        z.object({
          dow: z.number().int().min(0).max(6),
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
        }),
      )
      .default([]),
  });

export const ChargerCreateInputZ = ChargerCreateFieldsZ.refine(
  (c) =>
    (c.hardwareTier === 'tier_4_unmetered' && typeof c.pricePerHourCents === 'number') ||
    (c.hardwareTier !== 'tier_4_unmetered' && typeof c.pricePerKwhCents === 'number'),
  { message: 'Tier 4 must price per hour; other tiers must price per kWh.' },
);
export type ChargerCreateInput = z.infer<typeof ChargerCreateInputZ>;

export const ChargerUpdateInputZ = z.object({
  id: z.string().uuid(),
  patch: ChargerCreateFieldsZ.partial(),
});
export type ChargerUpdateInput = z.infer<typeof ChargerUpdateInputZ>;

export const NearbyInputZ = z.object({
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int().positive().max(100_000),
  filters: z
    .object({
      connectorType: ConnectorTypeZ.optional(),
      availableNow: z.boolean().optional(),
      maxPriceCents: z.number().int().nonnegative().optional(),
      minPowerKw: z.number().nonnegative().optional(),
    })
    .default({}),
});
export type NearbyInput = z.infer<typeof NearbyInputZ>;
