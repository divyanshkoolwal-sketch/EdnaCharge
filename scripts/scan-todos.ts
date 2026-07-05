/** @file scripts/scan-todos.ts — technical-debt scanner for TODO/FIXME markers. */
//
// Walks the source tree and reports TODO/FIXME/HACK/XXX markers so technical
// debt is tracked rather than silently accreting. AGENTS.md keeps open work in
// docs/todo.md (not source comments), so a clean tree reports zero. Runs in CI
// (see .github/workflows/ci.yml). Report-only by default; pass --strict to make
// any untracked marker a non-zero exit (e.g. to fail a PR that adds one).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOTS = ['apps', 'packages', 'tools', 'scripts'];
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  'coverage',
  'ios',
  'android',
  '.expo',
]);
const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
const strict = process.argv.includes('--strict');

type Hit = { file: string; line: number; text: string };
const hits: Hit[] = [];

function walk(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (SOURCE_EXTS.has(extname(entry.name))) scan(filePath);
  }
}

function scan(file: string): void {
  // Don't flag this scanner's own source — it necessarily contains the marker
  // words in its pattern and messages.
  if (file.endsWith('scan-todos.ts')) return;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (MARKER.test(text)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 120) });
  });
}

for (const root of ROOTS) walk(root);

if (hits.length === 0) {
  console.log('No TODO/FIXME/HACK/XXX markers found in source. Open work lives in docs/todo.md.');
  process.exit(0);
}

console.log(`Found ${hits.length} technical-debt marker(s):`);
for (const hit of hits) console.log(`- ${hit.file}:${hit.line}  ${hit.text}`);
process.exit(strict ? 1 : 0);
