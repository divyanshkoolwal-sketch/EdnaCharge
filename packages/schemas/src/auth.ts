/** @file packages/schemas/src/auth.ts. */
import { z } from 'zod';
import { ConnectorTypeZ } from './enums.js';

// Edit-profile: update the display name. Avatars are set ONLY via uploadAvatar
// (which stores to our own bucket) — we deliberately do NOT accept an arbitrary
// avatarUrl here, so a client can't point another user's rendered avatar at an
// attacker-controlled URL (tracking beacon / arbitrary content).
export const UpdateProfileInputZ = z.object({
  fullName: z.string().min(1).max(100),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputZ>;

// Avatar upload: a base64-encoded image sent to the API, which stores it in
// Supabase Storage and returns the public URL. Bounded so a client can't ship a
// huge payload (avatars are picked small + compressed).
export const UploadAvatarInputZ = z.object({
  base64: z.string().min(1).max(4_000_000),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
});
export type UploadAvatarInput = z.infer<typeof UploadAvatarInputZ>;

export const DriverProfileInputZ = z.object({
  fullName: z.string().min(1).max(100),
  vehicleMake: z.string().min(1).max(40),
  vehicleModel: z.string().min(1).max(60),
  vehicleYear: z.number().int().min(1990).max(2100),
  connectorType: ConnectorTypeZ,
  licensePlate: z.string().max(16).optional(),
});
export type DriverProfileInput = z.infer<typeof DriverProfileInputZ>;

export const HostIdentityInputZ = z.object({
  legalName: z.string().min(1).max(120),
  dob: z.string().datetime(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(3),
  country: z.string().length(2).default('US'),
});
export type HostIdentityInput = z.infer<typeof HostIdentityInputZ>;
