// Flat ESLint config for the EdnaCharge monorepo.
//
// Introduces linting (beyond `tsc --noEmit`) with the quality rules the team
// wants to track — naming consistency, cyclomatic complexity, and unused
// code/vars. Rules that a large existing codebase would violate are seeded at
// `warn` so they surface in editors and CI without blocking `pnpm lint`
// (only errors fail the run). Ratchet these to `error` over time.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/*.d.ts',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      'docs/api-reference/**',
      '.context/**',
      '.playwright-mcp/**',
      '.profiles/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021, __DEV__: 'readonly' },
    },
    rules: {
      // TypeScript itself resolves identifiers; the base rule false-positives on
      // types/ambient globals in flat config.
      'no-undef': 'off',
      // Quality rules the readiness rubric tracks — introduced as warnings.
      complexity: ['warn', 20],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'typeLike', format: ['PascalCase'] },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
      ],
      // Downgrade recommended rules legacy code trips so the run stays green.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // React Native app: register the hooks plugin the code already relies on
    // (its `eslint-disable react-hooks/exhaustive-deps` comments would otherwise
    // be "unknown rule" errors). Kept at warn.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Tests, fixtures, mobile UI, scripts and tools carry many intentional
    // patterns (any in test doubles, PascalCase RN components, etc.).
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.fixture.ts',
      '**/test/**',
      'apps/mobile/**',
      'scripts/**',
      'tools/**',
    ],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      complexity: 'off',
    },
  },
);
