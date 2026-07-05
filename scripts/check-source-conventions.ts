/** @file scripts/check-source-conventions.ts. */
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
const MAX_LOC = 300;

const files: string[] = [];

function walk(dir: string) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
    } else if (SOURCE_EXTS.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
      // Skip ambient/generated .d.ts declarations (e.g. Expo's expo-env.d.ts,
      // .expo/types/*) — they aren't authored source and carry no docstring.
      files.push(filePath);
    }
  }
}

function lineCount(text: string) {
  if (text.length === 0) return 0;
  const normalized = text.replace(/\r\n/g, '\n');
  const withoutFinalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return withoutFinalNewline.split('\n').length;
}

function topDocstringLine(lines: string[]) {
  const first = lines[0]?.trim() ?? '';
  return first.startsWith('#!') ? (lines[1]?.trim() ?? '') : first;
}

for (const root of ROOTS) walk(root);

const failures: string[] = [];
for (const file of files.sort()) {
  const text = readFileSync(file, 'utf8');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (!topDocstringLine(lines).startsWith('/**')) {
    failures.push(`${file}: missing top file docstring`);
  }
  const loc = lineCount(text);
  if (loc > MAX_LOC) failures.push(`${file}: ${loc} LOC exceeds ${MAX_LOC}`);
}

if (failures.length > 0) {
  console.error(`Source convention check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Source convention check passed (${files.length} files).`);
