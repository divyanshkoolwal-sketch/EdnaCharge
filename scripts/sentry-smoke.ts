import '@edna/config';

// Fires /_sentry-test on each running service. Each service calls Sentry.captureException
// and flushes before responding, so a 200 here means the event was sent (or the DSN was
// missing — in which case the service logs a warning at boot and we fail here).

const services = [
  { name: 'api', url: `http://localhost:${process.env.API_PORT ?? 3000}/_sentry-test`, dsn: 'SENTRY_DSN_API' },
  { name: 'csms', url: `http://localhost:${process.env.CSMS_PORT ?? 3100}/_sentry-test`, dsn: 'SENTRY_DSN_CSMS' },
  { name: 'worker', url: `http://localhost:${process.env.WORKER_PORT ?? 3200}/_sentry-test`, dsn: 'SENTRY_DSN_WORKER' },
];

async function main() {
  let allOk = true;
  for (const svc of services) {
    if (!process.env[svc.dsn]) {
      console.error(`✗ ${svc.name}: ${svc.dsn} is not set`);
      allOk = false;
      continue;
    }
    try {
      const res = await fetch(svc.url);
      if (!res.ok) {
        console.error(`✗ ${svc.name}: HTTP ${res.status}`);
        allOk = false;
        continue;
      }
      console.log(`✓ ${svc.name}: Sentry event fired`);
    } catch (err) {
      console.error(`✗ ${svc.name}: ${(err as Error).message}`);
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
}

main();
