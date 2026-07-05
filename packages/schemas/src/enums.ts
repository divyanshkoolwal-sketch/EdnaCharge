import { z } from 'zod';

export const RoleZ = z.enum(['driver', 'host']);
export type Role = z.infer<typeof RoleZ>;

export const ConnectorTypeZ = z.enum(['j1772', 'nacs', 'tesla', 'ccs1', 'chademo']);
export type ConnectorType = z.infer<typeof ConnectorTypeZ>;

export const HardwareTierZ = z.enum([
  'tier_1_smart_plug',
  'tier_2_bridge_kit',
  'tier_3_native',
  'tier_4_unmetered',
]);
export type HardwareTier = z.infer<typeof HardwareTierZ>;

export const BookingStatusZ = z.enum([
  'pending',
  'confirmed',
  'declined',
  'cancelled',
  'active',
  'completed',
  'no_show',
  'errored',
]);
export type BookingStatus = z.infer<typeof BookingStatusZ>;

export const ChargerStatusZ = z.enum(['offline', 'available', 'occupied', 'faulted']);
export type ChargerStatus = z.infer<typeof ChargerStatusZ>;

export const MessageKindZ = z.enum(['text', 'system']);
export type MessageKind = z.infer<typeof MessageKindZ>;
