/** @file packages/schemas/src/enums.ts. */
import { z } from 'zod';

export const ConnectorTypeZ = z.enum(['j1772', 'nacs', 'tesla', 'ccs1', 'chademo']);
export type ConnectorType = z.infer<typeof ConnectorTypeZ>;

export const AppRoleZ = z.enum(['driver', 'host']);
export type AppRole = z.infer<typeof AppRoleZ>;

export const HardwareTierZ = z.enum([
  'tier_1_smart_plug',
  'tier_2_bridge_kit',
  'tier_3_native',
  'tier_4_unmetered',
]);
export type HardwareTier = z.infer<typeof HardwareTierZ>;
