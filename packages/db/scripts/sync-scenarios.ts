// `pnpm scenarios:sync`: upsert every scenario file into the database.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadScenarios } from '@snow-mastery/scenarios';
import { createPrismaClient, syncScenario } from '../src';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const prisma = createPrismaClient();
try {
  for (const scenario of loadScenarios()) {
    await syncScenario(prisma, scenario);
    console.log(`  ✔ ${scenario.id} v${scenario.version}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
