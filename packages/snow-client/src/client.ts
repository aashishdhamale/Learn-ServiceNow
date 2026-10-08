import { CicdApi } from './cicd';
import { SnowHttp, type FetchLike, type RetryPolicy, type TokenProvider } from './http';
import { instanceBaseUrl, normalizeInstanceName } from './instance';
import { TableApi } from './table';

export interface SnowClientOptions {
  instance: string;
  tokens: TokenProvider;
  /** SNOW_INSTANCE_URL_TEMPLATE; tests and e2e only. */
  urlTemplate?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface SnowClient {
  instance: string;
  baseUrl: string;
  table: TableApi;
  cicd: CicdApi;
}

export function createSnowClient(options: SnowClientOptions): SnowClient {
  const instance = normalizeInstanceName(options.instance);
  const baseUrl = instanceBaseUrl(instance, options.urlTemplate);
  const http = new SnowHttp({
    baseUrl,
    tokens: options.tokens,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    retry: options.retry,
    sleep: options.sleep,
    random: options.random,
  });
  const table = new TableApi(http);
  return { instance, baseUrl, table, cicd: new CicdApi(http, table) };
}
