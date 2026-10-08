import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'grader',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
