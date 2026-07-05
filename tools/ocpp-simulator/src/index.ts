#!/usr/bin/env tsx
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

  const startRes = (await client.call('StartTransaction', {
    connectorId: 1,
    idTag: 'SIM',
    meterStart: 0,
    timestamp: new Date().toISOString(),
  })) as { transactionId: number };

  const transactionId = startRes.transactionId;
  console.log(`[sim] transaction ${transactionId} started`);

  const samplePeriodMs = 10_000; // 6 samples / minute
  const powerW = 7200;
  const startedAt = Date.now();
  let energyWh = 0;

  const timer = setInterval(() => {
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

  await new Promise((r) => setTimeout(r, sessionMs));
  clearInterval(timer);

  await client.call('StopTransaction', {
    transactionId,
    meterStop: energyWh,
    timestamp: new Date().toISOString(),
  });
  await client.call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Available',
  });
  await client.close();
  console.log(`[sim] done. energy=${energyWh}Wh`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
