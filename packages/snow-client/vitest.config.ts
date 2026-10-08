import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'snow-client',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
