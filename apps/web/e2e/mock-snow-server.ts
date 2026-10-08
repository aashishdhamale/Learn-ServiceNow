// A mock ServiceNow PDI for e2e tests and UI work without a real instance:
//   pnpm --filter @snow-mastery/web mock:snow
// then set SNOW_INSTANCE_URL_TEMPLATE=http://127.0.0.1:4010 and connect with
// client id "mock-client" / secret "mock-secret". It serves the VIP scenario's correct
// fixture and a passing ATF suite. GET /__mock/mode?value=hibernating-redirect simulates sleep.
import { createServer, type IncomingMessage } from 'node:http';
import { getScenario, loadFixture } from '@snow-mastery/scenarios';
import { FakeInstance, type FakeMode } from '@snow-mastery/snow-client/testing';

const port = Number(process.env.MOCK_SNOW_PORT ?? 4010);
const vip = getScenario('vip-caller-alert');
if (!vip) throw new Error('vip-caller-alert scenario not found');

const fake = new FakeInstance({
  records: loadFixture(vip, process.env.MOCK_SNOW_FIXTURE ?? 'correct').records,
  oauthClients: [{ clientId: 'mock-client', clientSecret: 'mock-secret' }],
  staticTokens: [],
  suites: {
    [vip.functional!.suiteName]: {
      outcome: 'success',
      pollsUntilDone: 1,
      tests: [
        {
          name: 'VIP caller alert - server contract',
          status: 'success',
          output: 'Contract honoured.',
        },
      ],
    },
  },
});

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  return new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/__mock/mode') {
    fake.mode = (url.searchParams.get('value') as FakeMode) ?? 'awake';
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`mode=${fake.mode}`);
    return;
  }
  const response = await fake.handle(await toRequest(req));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => {
  console.log(`Mock ServiceNow listening on http://127.0.0.1:${port}`);
});
