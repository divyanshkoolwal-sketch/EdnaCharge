#!/usr/bin/env tsx
/** @file tools/ocpp-simulator/src/index.ts. */
// Simulator — mirrors real charger behavior over the same ocpp-rpc wire as the CSMS.
// Usage:
//   pnpm sim --charger sim-001 --session 30m [--csms ws://localhost:3100] [--password ...]

import { RPCClient } from 'ocpp-rpc';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function parseDuration(s: string): number {
  const m = /^(\d+)(s|m|h)$/.exec(s);
  if (!m) return 1800_000;
  const n = Number(m[1]);
  const mul = m[2] === 's' ? 1000 : m[2] === 'm' ? 60_000 : 3_600_000;
  return n * mul;
}

async function main() {
  const cpId = arg('charger') ?? 'sim-001';
  const sessionMs = parseDuration(arg('session') ?? '30m');
  const csms = arg('csms') ?? 'ws://localhost:3100';
  const password = arg('password') ?? process.env.OCPP_PASSWORD ?? '';
  const autostartIdTag = arg('idTag');

  const url = `${csms}/ocpp/v1.6/${cpId}`;
  console.log(`[sim] connecting ${url} (session ${sessionMs / 1000}s)`);
  // ocpp-rpc v2's RPC_ClientOptions declares many required fields. The runtime
  // applies sensible defaults — cast through unknown so the typecheck doesn't
  // demand we pass every knob.
  const client = new RPCClient({
    endpoint: url,
    identity: cpId,
    password,
    protocols: ['ocpp1.6'],
  } as unknown as ConstructorParameters<typeof RPCClient>[0]);

  await client.connect();
  console.log('[sim] connected');

  await client.call('BootNotification', {
    chargePointVendor: 'EdnaSim',
    chargePointModel: 'v1',
  });
  await client.call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Available',
  });

  const samplePeriodMs = 10_000; // 6 samples / minute
  const powerW = 7200;
  let transactionId: number | null = null;
  let startedAt = 0;
  let energyWh = 0;
  let timer: NodeJS.Timeout | null = null;
  let finish: (() => void) | null = null;

  const stopTransaction = async () => {
    if (!transactionId) return;
    const tx = transactionId;
    transactionId = null;
    if (timer) clearInterval(timer);
    timer = null;
    await client.call('StopTransaction', {
      transactionId: tx,
      meterStop: energyWh,
      timestamp: new Date().toISOString(),
    });
    await client.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
    });
    console.log(`[sim] done. energy=${energyWh}Wh`);
    finish?.();
  };

  const startTransaction = async (idTag: string) => {
    if (transactionId) return;
    console.log(`[sim] remote start idTag=${idTag}`);
    const startRes = (await client.call('StartTransaction', {
      connectorId: 1,
      idTag,
      meterStart: 0,
      timestamp: new Date().toISOString(),
    })) as { transactionId: number; idTagInfo?: { status?: string } };
    if (startRes.idTagInfo?.status === 'Invalid' || startRes.transactionId === 0) {
      console.log('[sim] start refused by CSMS');
      return;
    }
    transactionId = startRes.transactionId;
    startedAt = Date.now();
    energyWh = 0;
    console.log(`[sim] transaction ${transactionId} started`);
    await client.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Charging',
    });
    timer = setInterval(() => {
      if (!transactionId) return;
      const elapsedH = (Date.now() - startedAt) / 3_600_000;
      energyWh = Math.round(powerW * elapsedH);
      void client
        .call('MeterValues', {
          connectorId: 1,
          transactionId,
          meterValue: [
            {
              timestamp: new Date().toISOString(),
              sampledValue: [
                { value: String(energyWh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
                { value: String(powerW), measurand: 'Power.Active.Import', unit: 'W' },
                { value: '240', measurand: 'Voltage', unit: 'V' },
                { value: '30', measurand: 'Current.Import', unit: 'A' },
              ],
            },
          ],
        })
        .catch((err) => console.error('[sim] MeterValues error', err));
    }, samplePeriodMs);
    setTimeout(() => void stopTransaction(), sessionMs);
  };

  client.handle('RemoteStartTransaction', async ({ params }) => {
    const idTag = (params as { idTag?: string }).idTag;
    if (!idTag) return { status: 'Rejected' };
    void startTransaction(idTag).catch((err) => console.error('[sim] remote start error', err));
    return { status: 'Accepted' };
  });

  client.handle('RemoteStopTransaction', async ({ params }) => {
    const tx = (params as { transactionId?: number }).transactionId;
    if (!transactionId || tx !== transactionId) return { status: 'Rejected' };
    void stopTransaction().catch((err) => console.error('[sim] remote stop error', err));
    return { status: 'Accepted' };
  });

  if (autostartIdTag) void startTransaction(autostartIdTag);

  await new Promise<void>((resolve) => {
    finish = resolve;
  });
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
