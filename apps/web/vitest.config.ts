import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    name: 'web',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
});
