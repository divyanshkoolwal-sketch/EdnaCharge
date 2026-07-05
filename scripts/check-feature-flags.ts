/** @file scripts/check-feature-flags.ts — dead / undefined feature-flag detector. */
//
// Feature flags are temporary scaffolding (see docs/FEATURE_FLAGS.md). This gate
// keeps the flag surface honest so it can't rot into dead branches:
//   - DEAD flag: declared in packages/config/src/flags.ts but no code path is
//     gated on it. A flag whose only remaining trace is a comment or docstring
//     still counts as dead (comments are stripped before the scan).
//   - UNDEFINED flag: `isFlagEnabled('X')` names an X that isn't a declared
//     FlagName (a typo, or a flag deleted out from under a caller).
// Either condition fails the build. Runs in CI (see .github/workflows/ci.yml).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { FLAG_NAMES } from '../packages/config/src/flags.js';

// Anchor everything to the repo root (this file lives in <root>/scripts) so the
// scan works regardless of the caller's CWD.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps', 'packages', 'tools'].map((r) => join(REPO_ROOT, r));
const SOURCE_EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  'coverage',
  'ios',
  'android',
  '.expo',
]);
// Where flags are DEFINED — matches here are declarations, not code that gates
// on the flag, so this file is excluded from the reference scan.
const FLAG_DEFINITION = join(REPO_ROOT, 'packages', 'config', 'src', 'flags.ts');

const referenced = new Set<string>();
const isFlagEnabledArgs = new Set<string>();
const CALL_REF = /\bisFlagEnabled\(\s*['"]([A-Za-z0-9_]+)['"]/g;

// Strip block + line comments so a flag mentioned only in a comment/docstring is
// NOT counted as a live gate. The `[^:]` guard avoids eating `://` in a URL.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^:]|^)\/\/.*$/gm, '$1');
}

// A flag is "live" if the code gates on it in any of the supported forms:
//   flags.X                        (property access)
//   isFlagEnabled('X')             (call)
//   const { X } = flags            (destructured binding)
//   process.env.FLAG_X / ['FLAG_X'] (direct env read)
function isReferenced(flag: string, code: string): boolean {
  return (
    new RegExp(`\\bflags\\.${flag}\\b`).test(code) ||
    new RegExp(`\\bisFlagEnabled\\(\\s*['"]${flag}['"]`).test(code) ||
    new RegExp(`\\{[^}]*\\b${flag}\\b[^}]*\\}\\s*=\\s*flags\\b`).test(code) ||
    new RegExp(`\\bprocess\\.env\\.FLAG_${flag}\\b`).test(code) ||
    new RegExp(`\\bprocess\\.env\\[\\s*['"]FLAG_${flag}['"]`).test(code)
  );
}

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
  if (file === FLAG_DEFINITION || file.endsWith('check-feature-flags.ts')) return;
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const flag of FLAG_NAMES) {
    if (isReferenced(flag, code)) referenced.add(flag);
  }
  for (const m of code.matchAll(CALL_REF)) isFlagEnabledArgs.add(m[1]);
}

for (const root of ROOTS) walk(root);

const defined = new Set<string>(FLAG_NAMES);
const dead = [...defined].filter((flag) => !referenced.has(flag));
const undefinedUsed = [...isFlagEnabledArgs].filter((flag) => !defined.has(flag));

if (dead.length === 0 && undefinedUsed.length === 0) {
  console.log(`Feature-flag hygiene OK — ${defined.size} flag(s), all gated in code.`);
  process.exit(0);
}

if (dead.length > 0) {
  console.error('Dead feature flag(s) — declared but no code path gates on them:');
  for (const flag of dead) {
    console.error(
      `  - ${flag}  (remove from flags.ts and inline its branch; see docs/FEATURE_FLAGS.md)`,
    );
  }
}
if (undefinedUsed.length > 0) {
  console.error(
    'Undefined feature flag(s) — isFlagEnabled() names a flag not declared in flags.ts:',
  );
  for (const flag of undefinedUsed) console.error(`  - ${flag}`);
}
process.exit(1);
