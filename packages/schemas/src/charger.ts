/** @file packages/schemas/src/charger.ts. */
import { z } from 'zod';
import { ConnectorTypeZ, HardwareTierZ } from './enums.js';

const ChargerCreateFieldsZ = z.object({
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
  // NOTE: hosts do NOT set pricing. The $/kWh rate is computed server-side
  // from demand (see packages/schemas/src/pricing.ts) and locked on each
  // booking. Price fields were intentionally removed from the create/update
  // shapes so a host can never set or patch a rate.
  houseRules: z.string().max(500).optional(),
  gateCode: z.string().max(32).optional(),
  instantAvailable: z.boolean().default(false),
  availability: z
    .array(
      z.object({
        dow: z.number().int().min(0).max(6),
        // Enforce a real 24h HH:MM (00-23 : 00-59), not just two-digit pairs, so
        // an out-of-range window can't be stored and silently mishandled later.
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .default([]),
});

export const ChargerCreateInputZ = ChargerCreateFieldsZ;
export type ChargerCreateInput = z.infer<typeof ChargerCreateInputZ>;

export const ChargerUpdateInputZ = z.object({
  id: z.string().uuid(),
  // Optional free-text fields accept null on update so a host can CLEAR a
  // previously-set gate code / house rules (an erased field sends null, which
  // writes NULL). Under a plain `.partial()` an undefined key is dropped from
  // the patch, so the old value would silently persist and never be removable.
  patch: ChargerCreateFieldsZ.partial()
    .extend({
      houseRules: z.string().max(500).nullish(),
      gateCode: z.string().max(32).nullish(),
    })
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
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
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
