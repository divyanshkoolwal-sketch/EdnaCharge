import { z } from 'zod';
import { ConnectorTypeZ } from './enums.js';

export const EmailZ = z.string().email();
export const OtpCodeZ = z.string().regex(/^\d{6}$/);

export const RequestOtpInputZ = z.object({
  email: EmailZ,
});

export const VerifyOtpInputZ = z.object({
  email: EmailZ,
  code: OtpCodeZ,
});

// Edit-profile: update display name and/or avatar after onboarding.
export const UpdateProfileInputZ = z
  .object({
    fullName: z.string().min(1).max(100).optional(),
    avatarUrl: z.string().url().optional(),
  })
  .refine((v) => v.fullName !== undefined || v.avatarUrl !== undefined, {
    message: 'Nothing to update.',
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

// Identity verification (Stripe Identity)
export const VerificationStatusZ = z.enum([
  'unstarted',
  'processing',
  'requires_input',
  'verified',
  'canceled',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusZ>;
