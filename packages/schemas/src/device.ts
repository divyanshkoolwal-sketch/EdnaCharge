import { z } from 'zod';

export const DeviceStatusZ = z.enum(['provisioned', 'active', 'offline', 'error']);
export type DeviceStatus = z.infer<typeof DeviceStatusZ>;

export const HardwareModelZ = z.enum([
  'shelly-plus-plug-s',  // Shelly Plus Plug S / Gen3 — Tier 1
  'shelly-pro-em-50',    // Shelly Pro EM-50 — Tier 2
]);
export type HardwareModel = z.infer<typeof HardwareModelZ>;

export const RegisterDeviceInputZ = z.object({
  chargerId: z.string().uuid(),
  shellyDeviceId: z.string().min(1).max(64),
  mac: z.string().regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/),
  hardwareModel: HardwareModelZ,
  firmwareVersion: z.string().optional(),
});
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceInputZ>;

export const DeviceCommandInputZ = z.object({
  deviceId: z.string().uuid(),
  command: z.enum(['start', 'stop']),
});
export type DeviceCommandInput = z.infer<typeof DeviceCommandInputZ>;

export const MqttConfigZ = z.object({
  brokerUrl: z.string().url(),
  topicPrefix: z.string(),
  clientId: z.string(),
});
export type MqttConfig = z.infer<typeof MqttConfigZ>;
