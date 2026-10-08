import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'scenarios',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
