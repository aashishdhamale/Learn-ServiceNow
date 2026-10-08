import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@snow-mastery/ai',
    '@snow-mastery/db',
    '@snow-mastery/grader',
    '@snow-mastery/scenarios',
    '@snow-mastery/snow-client',
  ],
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  // Scenario YAML is read from disk at runtime; include it in server output traces.
  outputFileTracingIncludes: {
    '/**': ['../../packages/scenarios/content/**/*'],
  },
};

export default nextConfig;
