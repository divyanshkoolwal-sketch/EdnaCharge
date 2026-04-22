// Phase 0 demo loop: verify /healthz on api, csms, worker.
// Expanded in later phases (Phase 6+) to run a full scripted booking flow.

type Check = { name: string; url: string };

const checks: Check[] = [
  { name: 'api', url: `http://localhost:${process.env.API_PORT ?? 3000}/healthz` },
  { name: 'csms', url: `http://localhost:${process.env.CSMS_PORT ?? 3100}/healthz` },
  { name: 'worker', url: `http://localhost:${process.env.WORKER_PORT ?? 3200}/healthz` },
];

async function probe({ name, url }: Check): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`✗ ${name} ${url} → HTTP ${res.status}`);
      return false;
    }
    const body = (await res.json()) as { status?: string };
    const ok = body.status === 'ok';
    console.log(`${ok ? '✓' : '✗'} ${name} ${url} → ${JSON.stringify(body)}`);
    return ok;
  } catch (err) {
    console.error(`✗ ${name} ${url} → ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log('demo:loop — Phase 0 (health checks)');
  const results = await Promise.all(checks.map(probe));
  const passed = results.every(Boolean);
  console.log(passed ? '\nall services healthy' : '\none or more services unhealthy');
  process.exit(passed ? 0 : 1);
}

main();
