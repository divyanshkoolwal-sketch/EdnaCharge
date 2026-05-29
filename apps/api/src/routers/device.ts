import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { RegisterDeviceInputZ } from '@edna/schemas';
import { logger } from '../logger.js';

const MQTT_BROKER_PUBLIC = process.env.MQTT_BROKER_PUBLIC_URL ?? process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
// Empty prefix matches Shelly Gen2/Gen3 default (status pushed to {deviceId}/status/...).
const MQTT_TOPIC_PREFIX = '';

function parseBrokerUrl(url: string): { host: string; port: number; useSsl: boolean } {
  const useSsl = url.startsWith('mqtts://');
  const stripped = url.replace(/^mqtt[s]?:\/\//, '');
  const [host, portStr] = stripped.split(':');
  const port = portStr ? Number(portStr) : useSsl ? 8883 : 1883;
  return { host: host ?? 'localhost', port, useSsl };
}

export const deviceRouter = router({
  /**
   * Public broker connection info — shown to the host BEFORE they enter their
   * device ID, so they can configure MQTT in the Shelly app first.
   */
  brokerInfo: protectedProcedure.query(() => {
    const { host, port, useSsl } = parseBrokerUrl(MQTT_BROKER_PUBLIC);
    return {
      brokerUrl: MQTT_BROKER_PUBLIC,
      host,
      port,
      useSsl,
      // RPC publishing must be enabled on the device for our worker to send commands.
      enableRpc: true,
    };
  }),

  /**
   * Called by the mobile app after the host has paired their Shelly device.
   * Links the physical device to a charger row and returns the MQTT broker
   * config the host should enter in the Shelly app.
   */
  register: protectedProcedure
    .input(RegisterDeviceInputZ)
    .mutation(async ({ ctx, input }) => {
      const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
      if (charger.hostId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your charger.' });
      }
      if (!['tier_1_smart_plug', 'tier_2_bridge_kit'].includes(charger.hardwareTier)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Device registration is only for Tier 1 and Tier 2 chargers.',
        });
      }

      const existingDevice = await prisma.shellDevice.findUnique({ where: { chargerId: input.chargerId } });
      if (existingDevice) {
        // Re-registration: update the device row (handles firmware updates / replacement)
        const updated = await prisma.shellDevice.update({
          where: { id: existingDevice.id },
          data: {
            shellyDeviceId: input.shellyDeviceId,
            mac: input.mac,
            firmwareVersion: input.firmwareVersion,
            hardwareModel: input.hardwareModel,
            status: 'provisioned',
            lastSeenAt: null,
          },
        });
        logger.info({ deviceId: updated.id, shellyId: input.shellyDeviceId }, 'device: re-registered');
        return { device: updated, mqttConfig: buildMqttConfig(input.shellyDeviceId) };
      }

      // 128 bits of entropy via UUID — eliminates the collision risk we had
      // with 4 random bytes (32 bits) at fleet scale.
      const mqttClientId = `edna-${input.shellyDeviceId}-${randomUUID()}`;
      const device = await prisma.shellDevice.create({
        data: {
          chargerId: input.chargerId,
          shellyDeviceId: input.shellyDeviceId,
          mac: input.mac,
          mqttClientId,
          mqttTopicPrefix: MQTT_TOPIC_PREFIX,
          firmwareVersion: input.firmwareVersion,
          hardwareModel: input.hardwareModel,
          status: 'provisioned',
        },
      });

      logger.info({ deviceId: device.id, shellyId: input.shellyDeviceId }, 'device: registered');
      return { device, mqttConfig: buildMqttConfig(input.shellyDeviceId) };
    }),

  /** Returns the MQTT config for a device (shown again if host needs to reconfigure). */
  getMqttConfig: protectedProcedure
    .input(z.object({ chargerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
      if (charger.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const device = await prisma.shellDevice.findUnique({ where: { chargerId: input.chargerId } });
      if (!device) throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not registered.' });

      return { mqttConfig: buildMqttConfig(device.shellyDeviceId), device };
    }),

  /** Returns device status for a charger owned by the calling host. */
  status: protectedProcedure
    .input(z.object({ chargerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
      if (charger.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const device = await prisma.shellDevice.findUnique({ where: { chargerId: input.chargerId } });
      if (!device) return null;
      return device;
    }),

  /** Unlinks a device from a charger (e.g., replacing hardware). */
  unlink: protectedProcedure
    .input(z.object({ chargerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const charger = await prisma.charger.findUniqueOrThrow({ where: { id: input.chargerId } });
      if (charger.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const existing = await prisma.shellDevice.findUnique({ where: { chargerId: input.chargerId } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await prisma.shellDevice.delete({ where: { id: existing.id } });
      logger.info({ chargerId: input.chargerId }, 'device: unlinked');
      return { ok: true };
    }),
});

function buildMqttConfig(shellyDeviceId: string) {
  const { host, port, useSsl } = parseBrokerUrl(MQTT_BROKER_PUBLIC);
  // Drivers subscribe to `{shellyId}/status/{component}` (Shelly Gen2/3 default).
  // We expose the bare prefix used by the device firmware.
  const statusPrefix = MQTT_TOPIC_PREFIX
    ? `${MQTT_TOPIC_PREFIX}/${shellyDeviceId}/status`
    : `${shellyDeviceId}/status`;
  return {
    brokerUrl: MQTT_BROKER_PUBLIC,
    server: host,
    port,
    useSsl,
    clientId: `${shellyDeviceId}-edna`,
    enableRpc: true,
    rpcStatusTopicPattern: statusPrefix,
    instructions: [
      `1. Open the Shelly app and go to Settings → MQTT`,
      `2. Enable MQTT`,
      `3. Server: ${host}`,
      `4. Port: ${port}`,
      `5. Client ID: ${shellyDeviceId}-edna`,
      `6. Save and reboot`,
    ],
  };
}
