/**
 * In-process registry mapping chargerId → active ChargerDriver.
 *
 * Drivers are created on-demand (first job that needs them) and cached
 * for the life of the worker process. To prevent unbounded memory growth
 * over time, we evict drivers that haven't been touched in EVICTION_MS.
 */

import { prisma } from '@edna/db';
import { ShellyPlugDriver } from '../drivers/shelly-plug.js';
import { ShellyEmDriver } from '../drivers/shelly-em.js';
import type { ChargerDriver } from '../drivers/base.js';
import { logger } from '../logger.js';

interface CacheEntry {
  driver: ChargerDriver;
  lastUsed: number;
}

const _cache = new Map<string, CacheEntry>();
const EVICTION_MS = 60 * 60 * 1000; // 1 hour idle → evict
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 min

let _sweepTimer: NodeJS.Timeout | null = null;

function ensureSweeper() {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(() => {
    const cutoff = Date.now() - EVICTION_MS;
    for (const [id, entry] of _cache) {
      if (entry.lastUsed < cutoff) {
        entry.driver.destroy();
        _cache.delete(id);
        logger.info({ chargerId: id }, 'device-registry: evicted idle driver');
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweep
  if (_sweepTimer.unref) _sweepTimer.unref();
}

export async function getDriver(chargerId: string): Promise<ChargerDriver | null> {
  ensureSweeper();
  const cached = _cache.get(chargerId);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.driver;
  }

  const device = await prisma.shellDevice.findUnique({ where: { chargerId } });
  if (!device) return null;

  let driver: ChargerDriver;
  if (device.hardwareModel === 'shelly-plus-plug-s') {
    driver = new ShellyPlugDriver(device.id, device.shellyDeviceId);
  } else if (device.hardwareModel === 'shelly-pro-em-50') {
    driver = new ShellyEmDriver(device.id, device.shellyDeviceId);
  } else {
    logger.warn({ hardwareModel: device.hardwareModel, chargerId }, 'device-registry: unknown model');
    return null;
  }

  _cache.set(chargerId, { driver, lastUsed: Date.now() });
  logger.info(
    { chargerId, model: device.hardwareModel, shellyId: device.shellyDeviceId },
    'device-registry: driver created',
  );
  return driver;
}

export function evictDriver(chargerId: string): void {
  const entry = _cache.get(chargerId);
  if (entry) {
    entry.driver.destroy();
    _cache.delete(chargerId);
  }
}

/** Test/shutdown helper. */
export function _clearRegistry(): void {
  for (const entry of _cache.values()) entry.driver.destroy();
  _cache.clear();
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
}

export function _registrySize(): number {
  return _cache.size;
}
