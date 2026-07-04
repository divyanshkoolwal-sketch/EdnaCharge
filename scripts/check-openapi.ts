/** @file scripts/check-openapi.ts — keep docs/openapi.yaml in sync with the tRPC router. */
//
// The API surface is a tRPC router (typed contract, not REST), so the committed
// OpenAPI document (docs/openapi.yaml) documents the HTTP surface plus the list
// of tRPC routers under `x-trpc-routers`. This check fails if a router is added
// to apps/api/src/router.ts without documenting it — cheap freshness enforcement
// wired into CI.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const routerSrc = readFileSync(join(ROOT, 'apps/api/src/router.ts'), 'utf8');
const openapi = readFileSync(join(ROOT, 'docs/openapi.yaml'), 'utf8');

const start = routerSrc.indexOf('router({');
const end = routerSrc.indexOf('});', start);
if (start === -1 || end === -1) {
  console.error('check-openapi: could not locate appRouter in apps/api/src/router.ts');
  process.exit(1);
}

// Top-level router keys are the identifiers at exactly two-space indent inside
// the router({ ... }) literal; nested object lines sit deeper and are ignored.
const block = routerSrc.slice(start, end);
const keys = [...block.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);

const documented = new Set([...openapi.matchAll(/^\s*-\s*([A-Za-z0-9_]+)\s*$/gm)].map((m) => m[1]));

const missing = keys.filter((k) => !documented.has(k));
if (missing.length > 0) {
  console.error(
    `check-openapi: these tRPC routers are missing from docs/openapi.yaml x-trpc-routers: ${missing.join(', ')}`,
  );
  process.exit(1);
}

console.log(`check-openapi: OK — ${keys.length} tRPC routers documented in docs/openapi.yaml.`);
