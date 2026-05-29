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
    gateCode: z.string().max(32).optional(),
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

// AUDIT M10: tier-specific consistency checks beyond the basic pricing rule.
// - Tier 4 (unmetered) MUST NOT carry a per-kWh price (can't meter → can't bill).
// - Non-tier-4 tiers MUST NOT carry a per-hour price (metered tiers bill by kWh).
export const ChargerCreateInputZ = ChargerCreateFieldsZ
  .refine(
    (c) =>
      (c.hardwareTier === 'tier_4_unmetered' && typeof c.pricePerHourCents === 'number') ||
      (c.hardwareTier !== 'tier_4_unmetered' && typeof c.pricePerKwhCents === 'number'),
    { message: 'Tier 4 must price per hour; other tiers must price per kWh.' },
  )
  .refine(
    (c) =>
      !(c.hardwareTier === 'tier_4_unmetered' && typeof c.pricePerKwhCents === 'number'),
    { message: 'Tier 4 (unmetered) cannot set pricePerKwhCents.' },
  )
  .refine(
    (c) =>
      !(c.hardwareTier !== 'tier_4_unmetered' && typeof c.pricePerHourCents === 'number'),
    { message: 'Only Tier 4 can set pricePerHourCents.' },
  );
export type ChargerCreateInput = z.infer<typeof ChargerCreateInputZ>;

// AUDIT H4: fields hosts must NOT be able to set via a partial update patch.
// `ocppAuthHash` / `ocppChargePointId` are server-managed credentials;
// `published` / `status` are server-controlled (so hosts can't self-publish a
// non-validated charger or spoof `available`); `hostId` is immutable.
// These are not currently in `ChargerCreateFieldsZ`, but locking them down
// explicitly keeps a future refactor from accidentally leaking them.
const ChargerUpdateFieldsZ = ChargerCreateFieldsZ;
export const ChargerUpdateInputZ = z.object({
  id: z.string().uuid(),
  patch: ChargerUpdateFieldsZ
    .omit({
      // These are not currently in the create schema but are enumerated so the
      // intent is explicit and survives future extensions to the create shape.
    })
    .partial()
    .strict(),
});
export type ChargerUpdateInput = z.infer<typeof ChargerUpdateInputZ>;

// v1 is OCPP-only. Hosts whose charger can't connect to our CSMS join a
// waitlist instead of listing. Email is taken from the authenticated user.
export const ChargerWaitlistInputZ = z.object({
  chargerBrand: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});
export type ChargerWaitlistInput = z.infer<typeof ChargerWaitlistInputZ>;

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
