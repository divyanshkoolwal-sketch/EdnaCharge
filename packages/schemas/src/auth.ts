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
