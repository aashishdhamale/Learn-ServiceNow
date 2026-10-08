import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/next-env.d.ts',
      'packages/db/src/generated/**',
      // ServiceNow scripts (fixtures, ATF) are linted by our own grader, not ESLint.
      'packages/scenarios/content/**',
      'apps/web/test-results/**',
      'apps/web/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  ...nextVitals.map((config) => ({ ...config, files: ['apps/web/**/*.{ts,tsx}'] })),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web' } },
  },
);
