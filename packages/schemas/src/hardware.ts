import { z } from 'zod';
import { ConnectorTypeZ, HardwareTierZ } from './enums.js';

/// PRD §7 — stored in HostProfile.hardwareSetup (jsonb).
export const HardwareSetupZ = z.object({
  chargerLocation: z.enum(['wall_outlet', 'installed_level2', 'none', 'unsure']),
  chargerBrand: z.string().nullable(),
  chargerModel: z.string().nullable(),
  hasWifi: z.boolean().nullable(),
  connectorType: ConnectorTypeZ,
  powerKw: z.number().positive().max(50),
  hardwareTier: HardwareTierZ,
  submittedAt: z.string().datetime(),
});
export type HardwareSetup = z.infer<typeof HardwareSetupZ>;

/// Input shape used by `auth.submitChargerIdentification`.
export const ChargerIdentificationInputZ = HardwareSetupZ.omit({ submittedAt: true });
export type ChargerIdentificationInput = z.infer<typeof ChargerIdentificationInputZ>;
