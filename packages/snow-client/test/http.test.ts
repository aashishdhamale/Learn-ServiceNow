import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  SnowAuthError,
  SnowForbiddenError,
  SnowHibernatingError,
  SnowHttp,
  SnowInstanceNotFoundError,
  SnowInvalidResponseError,
  SnowRateLimitError,
  SnowServerError,
  SnowTimeoutError,
  type FetchLike,
} from '../src';
import { recordingSleep, staticTokens } from '../src/testing';

const Ok = z.object({ result: z.array(z.unknown()) });

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function sequence(...responses: Array<Response | Error>): FetchLike & { calls: number } {
  const fn = Object.assign(
    async () => {
      const next = responses[Math.min(fn.calls, responses.length - 1)]!;
      fn.calls++;
      if (next instanceof Error) throw next;
      return next.clone();
    },
    { calls: 0 },
  );
  return fn;
}

function http(fetch: FetchLike, extra: Partial<ConstructorParameters<typeof SnowHttp>[0]> = {}) {
  const sleep = recordingSleep();
  const client = new SnowHttp({
    baseUrl: 'https://dev1.service-now.com',
    tokens: staticTokens(),
    fetch,
    sleep: sleep.sleep,
    random: () => 1,
    ...extra,
  });
  return { client, delays: sleep.delays };
}

describe('SnowHttp', () => {
  it('sends the bearer token and query string, and validates the response', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, { result: [] }));
    const { client } = http(fetch);
    await client.request({
      path: '/api/now/table/sys_user',
      query: { sysparm_limit: 1, skip: undefined },
      schema: Ok,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://dev1.service-now.com/api/now/table/sys_user?sysparm_limit=1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(init?.redirect).toBe('manual');
  });

  it('retries transient 503s with exponential backoff, then succeeds', async () => {
    const fetch = sequence(
      jsonResponse(503, {}),
      jsonResponse(503, {}),
      jsonResponse(200, { result: [] }),
    );
    const { client, delays } = http(fetch);
    await expect(client.request({ path: '/x', schema: Ok })).resolves.toEqual({ result: [] });
    expect(fetch.calls).toBe(3);
    expect(delays).toEqual([300, 600]);
  });

  it('gives up after maxRetries', async () => {
    const fetch = sequence(jsonResponse(502, {}));
    const { client } = http(fetch, { retry: { maxRetries: 2 } });
    await expect(client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowServerError,
    );
    expect(fetch.calls).toBe(3);
  });

  it('honours Retry-After on 429, even for non-idempotent requests', async () => {
    const fetch = sequence(
      jsonResponse(429, {}, { 'retry-after': '2' }),
      jsonResponse(200, { result: [] }),
    );
    const { client, delays } = http(fetch);
    await client.request({ method: 'POST', path: '/x', schema: Ok, idempotent: false });
    expect(delays).toEqual([2000]);
  });

  it('does not retry a non-idempotent request after a timeout', async () => {
    const fetch = sequence(new DOMException('timed out', 'TimeoutError'));
    const { client } = http(fetch, { timeoutMs: 50 });
    await expect(
      client.request({ method: 'POST', path: '/x', schema: Ok, idempotent: false }),
    ).rejects.toBeInstanceOf(SnowTimeoutError);
    expect(fetch.calls).toBe(1);
  });

  it('maps DNS failures to SnowInstanceNotFoundError without retrying', async () => {
    const dnsError = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const fetch = sequence(dnsError);
    const { client } = http(fetch);
    await expect(client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowInstanceNotFoundError,
    );
    expect(fetch.calls).toBe(1);
  });

  it('refreshes the token once on 401 and replays the request', async () => {
    const fetch = sequence(
      jsonResponse(401, { error: { message: 'User Not Authenticated' } }),
      jsonResponse(200, { result: [] }),
    );
    const refreshAccessToken = vi.fn(async () => 'fresh');
    const { client } = http(fetch, {
      tokens: { getAccessToken: async () => 'stale', refreshAccessToken },
    });
    await expect(client.request({ path: '/x', schema: Ok })).resolves.toEqual({ result: [] });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('throws SnowAuthError when the refreshed token is rejected too', async () => {
    const fetch = sequence(jsonResponse(401, { error: { message: 'User Not Authenticated' } }));
    const { client } = http(fetch);
    await expect(client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(SnowAuthError);
    expect(fetch.calls).toBe(2);
  });

  it('maps 403 to SnowForbiddenError with the ServiceNow message', async () => {
    const fetch = sequence(
      jsonResponse(403, { error: { message: 'User Not Authorized', detail: 'ACL' } }),
    );
    const { client } = http(fetch);
    const error = await client.request({ path: '/x', schema: Ok }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnowForbiddenError);
    expect(error).toMatchObject({ message: 'User Not Authorized', detail: 'ACL' });
  });

  it('detects hibernation from a redirect and from an HTML page', async () => {
    const redirect = sequence(
      new Response(null, {
        status: 302,
        headers: { location: 'https://developer.servicenow.com/dev.do' },
      }),
    );
    await expect(http(redirect).client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowHibernatingError,
    );

    const html = sequence(
      new Response('<p>Your instance is hibernating</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(http(html).client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowHibernatingError,
    );
  });

  it('rejects non-JSON and unexpected shapes as SnowInvalidResponseError', async () => {
    const html = sequence(
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(http(html).client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowInvalidResponseError,
    );

    const wrong = sequence(jsonResponse(200, { result: 'nope' }));
    await expect(http(wrong).client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowInvalidResponseError,
    );
  });

  it('exposes the retry-after delay on rate limit errors when retries are exhausted', async () => {
    const fetch = sequence(jsonResponse(429, {}, { 'retry-after': '1' }));
    const { client } = http(fetch, { retry: { maxRetries: 0 } });
    await expect(client.request({ path: '/x', schema: Ok })).rejects.toMatchObject({
      retryAfterMs: 1000,
    });
    await expect(client.request({ path: '/x', schema: Ok })).rejects.toBeInstanceOf(
      SnowRateLimitError,
    );
  });
});
